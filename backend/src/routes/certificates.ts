import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { decrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  createCertificateSchema,
  updateCertificateSchema,
  batchRenewSchema,
  revokeCertificateSchema,
  certificateListQuerySchema,
  checkDomainSchema,
} from '../utils/validation';
import { addRenewalJob } from '../utils/queue';
import { createDnsProvider } from '../services/dns';
import { DnsVerifier } from '../services/dnsVerifier';

const router = Router();

router.use(authenticate);

// 证书概览统计
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const [
    total,
    byStatus,
    expiring7d,
    expiring30d,
    hasProcessing,
    recentLogs,
  ] = await Promise.all([
    prisma.certificate.count({ where: { userId } }),
    prisma.certificate.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    prisma.certificate.count({
      where: {
        userId,
        status: 'active',
        expiresAt: { lte: in7Days, gt: now },
      },
    }),
    prisma.certificate.count({
      where: {
        userId,
        status: 'active',
        expiresAt: { lte: in30Days, gt: now },
      },
    }),
    prisma.certificate.count({
      where: {
        userId,
        status: { in: ['pending_renewal', 'processing'] },
      },
    }),
    prisma.renewalLog.findMany({
      where: {
        certificate: { userId },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        certificate: { select: { domain: true } },
        triggerType: true,
        result: true,
        finishedAt: true,
        durationMs: true,
      },
    }),
  ]);
  
  const statusCount: Record<string, number> = {
    active: 0,
    pending_initial: 0,
    pending_renewal: 0,
    processing: 0,
    failed: 0,
    expired: 0,
    revoked: 0,
  };
  
  byStatus.forEach((item) => {
    statusCount[item.status] = item._count.status;
  });
  
  res.success({
    total,
    byStatus: statusCount,
    expiring7d,
    expiring30d,
    hasProcessing: hasProcessing > 0,
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      domain: log.certificate.domain,
      triggerType: log.triggerType,
      result: log.result,
      finishedAt: log.finishedAt,
      durationMs: log.durationMs,
    })),
  });
}));

// 证书列表
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const query = certificateListQuerySchema.parse(req.query);
  
  const where: any = { userId };
  
  if (query.status) {
    where.status = query.status;
  }
  
  if (query.search) {
    where.domain = { contains: query.search, mode: 'insensitive' };
  }
  
  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      include: {
        dnsCredential: {
          select: { name: true, provider: true },
        },
      },
      skip: (query.page - 1) * query.size,
      take: query.size,
      orderBy: { [query.sort]: query.order },
    }),
    prisma.certificate.count({ where }),
  ]);
  
  res.success(items, { page: query.page, size: query.size, total });
}));

// 创建证书
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const data = createCertificateSchema.parse(req.body);
  
  // 检查 DNS 凭据是否存在且属于当前用户
  const credential = await prisma.dnsCredential.findFirst({
    where: { id: data.dns_credential_id, userId },
  });
  
  if (!credential) {
    throw new AppError('DNS credential not found', 404, 'NOT_FOUND');
  }
  
  // 构建域名列表
  const domains = [data.domain];
  if (data.is_wildcard) {
    domains.push(`*.${data.domain}`);
  }
  
  // 检查是否已存在相同的域名
  const existing = await prisma.certificate.findUnique({
    where: {
      userId_domain: {
        userId,
        domain: data.domain,
      },
    },
  });
  
  if (existing) {
    throw new AppError('Certificate for this domain already exists', 409, 'DUPLICATE_DOMAIN');
  }
  
  // 获取或创建 ACME 账户
  let acmeAccount = await prisma.acmeAccount.findFirst({
    where: { userId, environment: 'staging' },
  });
  
  if (!acmeAccount) {
    // 创建新账户
    const { AcmeService } = await import('../services/acme');
    const accountId = await AcmeService.createAccount(
      prisma,
      userId,
      req.user!.email,
      'staging'
    );
    acmeAccount = await prisma.acmeAccount.findUnique({ where: { id: accountId } })!;
  }
  
  // 创建证书记录
  const certificate = await prisma.certificate.create({
    data: {
      userId,
      dnsCredentialId: data.dns_credential_id,
      acmeAccountId: acmeAccount!.id,
      domain: data.domain,
      sanDomains: domains,
      isWildcard: data.is_wildcard,
      autoRenew: data.auto_renew,
      renewBeforeDays: data.renew_before_days,
      status: data.issue_now ? 'pending_renewal' : 'pending_initial',
    },
    include: {
      dnsCredential: {
        select: { name: true, provider: true },
      },
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'certificate.create',
      resourceType: 'certificate',
      resourceId: certificate.id,
      detail: {
        domain: data.domain,
        isWildcard: data.is_wildcard,
        issueNow: data.issue_now,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  // 如果需要立即签发，加入队列
  if (data.issue_now) {
    await addRenewalJob(certificate.id, 10); // 高优先级
    
    // 创建续期日志
    await prisma.renewalLog.create({
      data: {
        certificateId: certificate.id,
        triggerType: 'manual_single',
        triggeredBy: userId,
        result: 'running',
      },
    });
  }
  
  res.success(certificate);
}));

// 获取证书详情
router.get('/:id', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  const certificate = await prisma.certificate.findFirst({
    where: { id, userId },
    include: {
      dnsCredential: {
        select: { id: true, name: true, provider: true },
      },
    },
  });
  
  if (!certificate) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  // 解密私钥（如果有）
  let privateKey = null;
  if (certificate.privateKeyPem) {
    try {
      privateKey = decrypt(certificate.privateKeyPem);
    } catch {
      // 解密失败
    }
  }
  
  res.success({
    ...certificate,
    privateKeyPem: privateKey,
  });
}));

// 更新证书配置
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const data = updateCertificateSchema.parse(req.body);
  
  const existing = await prisma.certificate.findFirst({
    where: { id, userId },
  });
  
  if (!existing) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  const certificate = await prisma.certificate.update({
    where: { id },
    data: {
      autoRenew: data.auto_renew,
      renewBeforeDays: data.renew_before_days,
    },
    include: {
      dnsCredential: {
        select: { name: true, provider: true },
      },
    },
  });
  
  res.success(certificate);
}));

// 删除证书
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  const existing = await prisma.certificate.findFirst({
    where: { id, userId },
  });
  
  if (!existing) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  // 检查是否正在处理中
  if (existing.status === 'processing') {
    throw new AppError('Cannot delete: certificate is being processed', 409, 'PROCESSING');
  }
  
  await prisma.certificate.delete({ where: { id } });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'certificate.delete',
      resourceType: 'certificate',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.status(204).send();
}));

// 查询证书状态
router.get('/:id/status', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  const certificate = await prisma.certificate.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      updatedAt: true,
    },
  });
  
  if (!certificate) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  // 获取当前步骤（如果有正在进行的续期日志）
  const latestLog = await prisma.renewalLog.findFirst({
    where: {
      certificateId: id,
      result: 'running',
    },
    orderBy: { createdAt: 'desc' },
    select: { steps: true },
  });
  
  const daysRemaining = certificate.expiresAt
    ? Math.ceil((certificate.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;
  
  res.success({
    id: certificate.id,
    status: certificate.status,
    daysRemaining,
    updatedAt: certificate.updatedAt,
    currentStep: latestLog?.steps ? (latestLog.steps as any[]).find((s) => s.status === 'running') : null,
  });
}));

// 域名归属预检
router.post('/check-domain', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const data = checkDomainSchema.parse(req.body);
  
  // 获取 DNS 凭据
  const credential = await prisma.dnsCredential.findFirst({
    where: { id: data.dns_credential_id, userId },
  });
  
  if (!credential) {
    throw new AppError('DNS credential not found', 404, 'NOT_FOUND');
  }
  
  // 解密凭据
  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(decrypt(credential.credentials));
  } catch {
    throw new AppError('Failed to decrypt credentials', 500, 'DECRYPTION_ERROR');
  }
  
  // 获取 Zone 列表并检查域名归属
  const provider = createDnsProvider(credential.provider as any, credentials);
  const zones = await provider.listZones();
  
  const isValid = DnsVerifier.verifyDomainOwnership(data.domain, zones);
  
  if (isValid) {
    // 找到匹配的 Zone
    const domainParts = data.domain.split('.');
    let matchedZone = null;
    for (let i = 0; i < domainParts.length - 1; i++) {
      const zoneName = domainParts.slice(i).join('.');
      const zone = zones.find((z) => z.name === zoneName);
      if (zone) {
        matchedZone = zone.name;
        break;
      }
    }
    
    res.success({
      valid: true,
      zoneName: matchedZone,
    });
  } else {
    res.success({
      valid: false,
      error: 'Domain not found in your DNS account. Please check the spelling or DNS hosting settings.',
    });
  }
}));

// 批量续期
router.post('/renew', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const data = batchRenewSchema.parse(req.body);
  
  const results = [];
  
  for (const certId of data.cert_ids) {
    const cert = await prisma.certificate.findFirst({
      where: { id: certId, userId },
    });
    
    if (!cert) {
      results.push({ id: certId, accepted: false, reason: 'Certificate not found' });
      continue;
    }
    
    if (cert.status === 'processing' || cert.status === 'pending_renewal') {
      results.push({ id: certId, accepted: false, reason: 'Certificate is already being processed' });
      continue;
    }
    
    // 更新状态并加入队列
    await prisma.certificate.update({
      where: { id: certId },
      data: { status: 'pending_renewal' },
    });
    
    await addRenewalJob(certId, 10);
    
    // 创建续期日志
    await prisma.renewalLog.create({
      data: {
        certificateId: certId,
        triggerType: 'manual_batch',
        triggeredBy: userId,
        result: 'running',
      },
    });
    
    results.push({ id: certId, accepted: true });
  }
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'certificate.batch_renew',
      resourceType: 'certificate',
      detail: { certIds: data.cert_ids, results },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success({ results });
}));

// 吊销证书
router.post('/:id/revoke', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const data = revokeCertificateSchema.parse(req.body);
  
  const cert = await prisma.certificate.findFirst({
    where: { id, userId },
    include: { acmeAccount: true },
  });
  
  if (!cert) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  if (!cert.certificatePem) {
    throw new AppError('No certificate to revoke', 400, 'NO_CERTIFICATE');
  }
  
  // 调用 ACME 吊销
  const { AcmeService } = await import('../services/acme');
  const acmeService = new AcmeService(prisma, cert.acmeAccountId!, cert.acmeAccount!.environment as any);
  await acmeService.initialize();
  
  await acmeService.revokeCertificate(cert.certificatePem, 0);
  
  // 更新状态
  await prisma.certificate.update({
    where: { id },
    data: {
      status: 'revoked',
      autoRenew: false, // 吊销后停止自动续期
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'certificate.revoke',
      resourceType: 'certificate',
      resourceId: id,
      detail: { reason: data.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success({ success: true });
}));

// 获取续期日志
router.get('/:id/logs', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const { page, size } = certificateListQuerySchema.parse(req.query);
  
  // 检查证书是否属于当前用户
  const cert = await prisma.certificate.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  
  if (!cert) {
    throw new AppError('Certificate not found', 404, 'NOT_FOUND');
  }
  
  const [items, total] = await Promise.all([
    prisma.renewalLog.findMany({
      where: { certificateId: id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.renewalLog.count({ where: { certificateId: id } }),
  ]);
  
  res.success(items, { page, size, total });
}));

export default router;
