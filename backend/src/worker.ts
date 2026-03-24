import { Worker } from 'bullmq';
import { prisma } from './utils/prisma';
import { decrypt, encrypt } from './utils/crypto';
import { AcmeService } from './services/acme';
import { createDnsProvider } from './services/dns';
import { DnsVerifier } from './services/dnsVerifier';
import { addWebhookJob } from './utils/queue';
import { RenewalStep } from './types';

// 错误翻译映射
const ERROR_TRANSLATIONS: Record<string, { reason: string; suggestion: string }> = {
  'DNS TXT record not found': {
    reason: 'DNS verification record not propagated',
    suggestion: 'Please check if the NS records are pointing to the correct DNS provider. If recently switched DNS, it may take 24-48 hours to propagate globally.',
  },
  'Invalid API token': {
    reason: 'DNS provider authentication failed',
    suggestion: 'Your DNS API credentials may have expired or been revoked. Please update them in [Credential Management].',
  },
  'Permission denied': {
    reason: 'DNS provider permission denied',
    suggestion: 'Your API credentials lack DNS editing permissions. Please check the permission configuration in your provider dashboard.',
  },
  'rate limit': {
    reason: "Let's Encrypt rate limit exceeded",
    suggestion: 'This domain has been rate-limited by Let\'s Encrypt. The system will retry automatically after N hours. Please do not attempt manual renewal.',
  },
  'authorization invalid': {
    reason: 'Domain validation failed',
    suggestion: "Let's Encrypt cannot verify your domain ownership. Please confirm your DNS hosting settings are correct.",
  },
  'Network timeout': {
    reason: "Let's Encrypt server communication timeout",
    suggestion: "Let's Encrypt service may be temporarily unavailable. The system will retry automatically.",
  },
  'Zone not found': {
    reason: 'DNS Zone not found',
    suggestion: 'This domain is not managed by your DNS account. Please check the spelling or DNS credentials.',
  },
};

function translateError(error: string): { reason: string; suggestion: string } {
  for (const [key, value] of Object.entries(ERROR_TRANSLATIONS)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return {
    reason: 'Unknown error',
    suggestion: 'Please contact support for assistance.',
  };
}

async function updateRenewalLog(
  logId: string,
  updates: {
    steps?: RenewalStep[];
    result?: 'running' | 'success' | 'failed';
    errorSummary?: string;
    errorDetail?: string;
    finishedAt?: Date;
    durationMs?: number;
  }
) {
  await prisma.renewalLog.update({
    where: { id: logId },
    data: {
      ...updates,
      steps: updates.steps as any,
    },
  });
}

async function updateCertificateStatus(
  certId: string,
  status: string,
  updates?: {
    failCount?: number;
    lastFailReason?: string;
    lastFailDetail?: string;
    lastFailAt?: Date;
    nextRetryAt?: Date;
  }
) {
  await prisma.certificate.update({
    where: { id: certId },
    data: {
      status,
      ...updates,
    },
  });
}

// 证书续期 Worker
const renewalWorker = new Worker(
  'certificate-renewal',
  async (job) => {
    const { certificateId } = job.data;
    const workerId = `${process.pid}-${job.id}`;
    
    // 获取证书信息（提前获取用于错误处理）
    const certInfo = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { domain: true },
    });
    
    console.log(`[${workerId}] Processing certificate ${certificateId}`);
    
    // 获取证书信息
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        dnsCredential: true,
        acmeAccount: true,
      },
    });
    
    if (!cert) {
      throw new Error(`Certificate not found: ${certificateId}`);
    }
    
    // 获取或创建续期日志
    let log = await prisma.renewalLog.findFirst({
      where: {
        certificateId,
        result: 'running',
      },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!log) {
      log = await prisma.renewalLog.create({
        data: {
          certificateId,
          triggerType: 'auto_cron',
          result: 'running',
          workerId,
        },
      });
    } else {
      await prisma.renewalLog.update({
        where: { id: log.id },
        data: { workerId },
      });
    }
    
    const logId = log.id;
    const steps: RenewalStep[] = [];
    const startTime = Date.now();
    
    function addStep(step: RenewalStep) {
      const existingIndex = steps.findIndex((s) => s.step === step.step);
      if (existingIndex >= 0) {
        steps[existingIndex] = { ...steps[existingIndex], ...step };
      } else {
        steps.push(step);
      }
    }
    
    try {
      // 1. 更新状态为处理中
      addStep({ step: 'init', status: 'success', started_at: new Date().toISOString(), finished_at: new Date().toISOString(), message: 'Worker started' });
      
      await updateCertificateStatus(certificateId, 'processing');
      await updateRenewalLog(logId, { steps });
      
      // 2. 创建 ACME 订单
      addStep({ step: 'create_order', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const acmeService = new AcmeService(prisma, cert.acmeAccountId!, cert.acmeAccount!.environment as any);
      await acmeService.initialize();
      
      const domains = cert.sanDomains as string[];
      const order = await acmeService.createOrder(domains);
      
      addStep({ step: 'create_order', status: 'success', finished_at: new Date().toISOString(), message: `Order created for ${domains.join(', ')}` });
      await updateRenewalLog(logId, { steps });
      
      // 保存订单 URL
      await prisma.certificate.update({
        where: { id: certificateId },
        data: { acmeOrderUrl: order.url },
      });
      
      // 3. 获取授权和 Challenge
      addStep({ step: 'get_authorizations', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const authorizations = await acmeService.getAuthorizations(order);
      const challenges = [];
      
      for (const authz of authorizations) {
        const challenge = acmeService.getDnsChallenge(authz);
        if (challenge) {
          const keyAuth = await acmeService.getDnsChallengeKeyAuthorization(challenge);
          challenges.push({
            domain: authz.identifier.value,
            challenge,
            keyAuth,
          });
        }
      }
      
      addStep({ step: 'get_authorizations', status: 'success', finished_at: new Date().toISOString(), message: `${challenges.length} challenges prepared` });
      await updateRenewalLog(logId, { steps });
      
      // 4. 添加 DNS 记录
      addStep({ step: 'add_dns_record', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const dnsCreds = JSON.parse(decrypt(cert.dnsCredential.credentials));
      const dnsProvider = createDnsProvider(cert.dnsCredential.provider as any, dnsCreds);
      
      const dnsCleanupTasks = [];
      
      for (const { domain, keyAuth } of challenges) {
        const recordName = `_acme-challenge.${domain}`;
        const result = await dnsProvider.addTxtRecord(domain, recordName, keyAuth);
        
        if (!result.success) {
          throw new Error(`Failed to add DNS record for ${domain}: ${result.error}`);
        }
        
        dnsCleanupTasks.push({ domain, recordName });
      }
      
      addStep({ step: 'add_dns_record', status: 'success', finished_at: new Date().toISOString(), message: `${challenges.length} DNS records added` });
      await updateRenewalLog(logId, { steps });
      
      // 5. 等待 DNS 传播
      addStep({ step: 'verify_dns_propagation', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const verifier = new DnsVerifier();
      
      for (const { domain, keyAuth } of challenges) {
        const recordName = `_acme-challenge.${domain}`;
        const result = await verifier.waitForTxtRecord(recordName, keyAuth);
        
        if (!result.success) {
          throw new Error(`DNS record not propagated for ${domain} after ${result.waitedMs}ms`);
        }
        
        addStep({
          step: 'verify_dns_propagation',
          status: 'running',
          detail: `${domain}: verified in ${result.waitedMs}ms`,
        });
        await updateRenewalLog(logId, { steps });
      }
      
      addStep({ step: 'verify_dns_propagation', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 6. 提交 Challenge
      addStep({ step: 'submit_challenge', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      for (const { challenge } of challenges) {
        await acmeService.completeChallenge(challenge);
      }
      
      addStep({ step: 'submit_challenge', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 7. 等待验证完成
      addStep({ step: 'wait_validation', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      for (const { challenge } of challenges) {
        await acmeService.waitForValidation(challenge);
      }
      
      addStep({ step: 'wait_validation', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 8. 生成 CSR 和私钥
      addStep({ step: 'generate_csr', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const { csr, privateKey } = await AcmeService.generateCsr(domains);
      
      addStep({ step: 'generate_csr', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 9. 最终化订单
      addStep({ step: 'finalize_order', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      await acmeService.finalizeOrder(order, csr);
      
      addStep({ step: 'finalize_order', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 10. 下载证书
      addStep({ step: 'download_certificate', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const fullchainPem = await acmeService.getCertificate(order);
      
      // 提取证书（第一个）
      const certMatch = fullchainPem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
      const certificatePem = certMatch ? certMatch[0] : fullchainPem;
      
      // 解析证书信息
      const forge = await import('node-forge');
      const certObj = forge.pki.certificateFromPem(certificatePem);
      const serialNumber = certObj.serialNumber;
      const fingerprint = forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(certObj)).getBytes()).digest().toHex();
      
      addStep({ step: 'download_certificate', status: 'success', finished_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      // 11. 保存证书
      addStep({ step: 'save_certificate', status: 'running', started_at: new Date().toISOString() });
      await updateRenewalLog(logId, { steps });
      
      const encryptedPrivateKey = encrypt(privateKey);
      
      await prisma.certificate.update({
        where: { id: certificateId },
        data: {
          fullchainPem,
          privateKeyPem: encryptedPrivateKey,
          certificatePem,
          serialNumber,
          fingerprintSha256: fingerprint,
          issuedAt: new Date(),
          expiresAt: certObj.validity.notAfter,
          status: 'active',
          failCount: 0,
          lastFailReason: null,
          lastFailDetail: null,
          lastFailAt: null,
          nextRetryAt: null,
        },
      });
      
      addStep({ step: 'save_certificate', status: 'success', finished_at: new Date().toISOString() });
      
      const durationMs = Date.now() - startTime;
      
      await updateRenewalLog(logId, {
        steps,
        result: 'success',
        finishedAt: new Date(),
        durationMs,
      });
      
      // 触发 Webhook
      await addWebhookJob({
        webhookConfigId: '', // 由 webhook 服务查找关联的配置
        event: 'renewal_success',
        payload: {
          certificateId,
          domain: cert.domain,
          success: true,
        },
      });
      
      console.log(`[${workerId}] Certificate ${certificateId} renewed successfully in ${durationMs}ms`);
      
    } catch (error) {
      console.error(`[${workerId}] Error processing certificate ${certificateId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const translation = translateError(errorMessage);
      
      // 更新失败步骤
      const currentStep = steps.find((s) => s.status === 'running');
      if (currentStep) {
        currentStep.status = 'failed';
        currentStep.error = translation.reason;
        currentStep.error_detail = errorMessage;
      }
      
      const durationMs = Date.now() - startTime;
      
      // 更新续期日志
      await updateRenewalLog(logId, {
        steps,
        result: 'failed',
        errorSummary: translation.reason,
        errorDetail: errorMessage,
        finishedAt: new Date(),
        durationMs,
      });
      
      // 更新证书状态
      const cert = await prisma.certificate.findUnique({
        where: { id: certificateId },
        select: { failCount: true },
      });
      
      const newFailCount = (cert?.failCount || 0) + 1;
      let nextRetryAt: Date | undefined;
      
      // 自动重试策略
      if (newFailCount === 1) {
        nextRetryAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6小时后
      } else if (newFailCount === 2) {
        nextRetryAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后
      }
      
      await updateCertificateStatus(certificateId, 'failed', {
        failCount: newFailCount,
        lastFailReason: translation.reason,
        lastFailDetail: errorMessage,
        lastFailAt: new Date(),
        nextRetryAt,
      });
      
      // 触发失败 Webhook
      await addWebhookJob({
        webhookConfigId: '',
        event: 'renewal_failed',
        payload: {
          certificateId,
          domain: certInfo?.domain || 'unknown',
          success: false,
          error: translation.reason,
        },
      });
      
      // 抛出错误让 BullMQ 处理重试
      throw error;
      
    } finally {
      // 12. 清理 DNS 记录
      try {
        addStep({ step: 'cleanup_dns', status: 'running', started_at: new Date().toISOString() });
        
        const cert = await prisma.certificate.findUnique({
          where: { id: certificateId },
          include: { dnsCredential: true },
        });
        
        if (cert?.dnsCredential) {
          const dnsCreds = JSON.parse(decrypt(cert.dnsCredential.credentials));
          const dnsProvider = createDnsProvider(cert.dnsCredential.provider as any, dnsCreds);
          
          const domains = cert.sanDomains as string[];
          for (const domain of domains) {
            const recordName = `_acme-challenge.${domain}`;
            await dnsProvider.removeTxtRecord(domain, recordName);
          }
        }
        
        addStep({ step: 'cleanup_dns', status: 'success', finished_at: new Date().toISOString() });
      } catch (cleanupError) {
        console.error(`[${workerId}] Error cleaning up DNS records:`, cleanupError);
        addStep({
          step: 'cleanup_dns',
          status: 'failed',
          error: 'Cleanup failed',
          error_detail: cleanupError instanceof Error ? cleanupError.message : 'Unknown',
        });
      }
      
      // 更新最终的 steps
      await updateRenewalLog(logId, { steps });
    }
  },
  {
    connection: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    concurrency: 3, // 同时处理 3 个证书
  }
);

// Worker 事件监听
renewalWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

renewalWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log('Certificate renewal worker started');

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await renewalWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...');
  await renewalWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
