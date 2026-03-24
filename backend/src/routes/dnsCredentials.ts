import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { encrypt, decrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { createDnsCredentialSchema, updateDnsCredentialSchema, paginationSchema } from '../utils/validation';
import { createDnsProvider } from '../services/dns';

const router = Router();

// 所有路由都需要认证
router.use(authenticate);

// 获取凭据列表
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { page, size } = paginationSchema.parse(req.query);
  
  const [items, total] = await Promise.all([
    prisma.dnsCredential.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        provider: true,
        verified: true,
        verifiedAt: true,
        zoneCount: true,
        createdAt: true,
        updatedAt: true,
      },
      skip: (page - 1) * size,
      take: size,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dnsCredential.count({ where: { userId } }),
  ]);
  
  res.success(items, { page, size, total });
}));

// 创建凭据
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const data = createDnsCredentialSchema.parse(req.body);
  
  // 加密凭据
  const encryptedCredentials = encrypt(JSON.stringify(data.credentials));
  
  const credential = await prisma.dnsCredential.create({
    data: {
      userId,
      name: data.name,
      provider: data.provider,
      credentials: encryptedCredentials,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      verified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'dns_credential.create',
      resourceType: 'dns_credential',
      resourceId: credential.id,
      detail: { name: data.name, provider: data.provider },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success(credential);
}));

// 更新凭据
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const data = updateDnsCredentialSchema.parse(req.body);
  
  // 检查是否存在且属于当前用户
  const existing = await prisma.dnsCredential.findFirst({
    where: { id, userId },
  });
  
  if (!existing) {
    throw new AppError('Credential not found', 404, 'NOT_FOUND');
  }
  
  const updateData: any = {};
  
  if (data.name) {
    updateData.name = data.name;
  }
  
  if (data.credentials) {
    updateData.credentials = encrypt(JSON.stringify(data.credentials));
    // 更新凭据后重置验证状态
    updateData.verified = false;
    updateData.verifiedAt = null;
    updateData.zoneCount = null;
  }
  
  const credential = await prisma.dnsCredential.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      provider: true,
      verified: true,
      verifiedAt: true,
      zoneCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'dns_credential.update',
      resourceType: 'dns_credential',
      resourceId: id,
      detail: { name: data.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.success(credential);
}));

// 删除凭据
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  // 检查是否存在且属于当前用户
  const existing = await prisma.dnsCredential.findFirst({
    where: { id, userId },
  });
  
  if (!existing) {
    throw new AppError('Credential not found', 404, 'NOT_FOUND');
  }
  
  // 检查是否有关联的证书
  const certCount = await prisma.certificate.count({
    where: { dnsCredentialId: id },
  });
  
  if (certCount > 0) {
    throw new AppError(
      `Cannot delete: ${certCount} certificate(s) are using this credential`,
      409,
      'RESOURCE_IN_USE'
    );
  }
  
  await prisma.dnsCredential.delete({ where: { id } });
  
  // 记录审计日志
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'dns_credential.delete',
      resourceType: 'dns_credential',
      resourceId: id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    },
  });
  
  res.status(204).send();
}));

// 验证凭据连通性
router.post('/:id/verify', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  // 获取凭据
  const credential = await prisma.dnsCredential.findFirst({
    where: { id, userId },
  });
  
  if (!credential) {
    throw new AppError('Credential not found', 404, 'NOT_FOUND');
  }
  
  // 解密凭据
  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(decrypt(credential.credentials));
  } catch {
    throw new AppError('Failed to decrypt credentials', 500, 'DECRYPTION_ERROR');
  }
  
  // 创建适配器并验证
  const provider = createDnsProvider(credential.provider as any, credentials);
  const result = await provider.verifyCredentials();
  
  if (result.valid) {
    // 获取 Zone 列表
    const zones = await provider.listZones();
    
    // 更新验证状态
    await prisma.dnsCredential.update({
      where: { id },
      data: {
        verified: true,
        verifiedAt: new Date(),
        zoneCount: zones.length,
      },
    });
    
    res.success({
      valid: true,
      zoneCount: zones.length,
      zones: zones.slice(0, 100), // 最多返回 100 个
    });
  } else {
    // 更新验证状态为失败
    await prisma.dnsCredential.update({
      where: { id },
      data: {
        verified: false,
        verifiedAt: new Date(),
      },
    });
    
    res.success({
      valid: false,
      error: result.error,
    });
  }
}));

// 获取 Zone 列表
router.get('/:id/zones', asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  
  // 获取凭据
  const credential = await prisma.dnsCredential.findFirst({
    where: { id, userId },
  });
  
  if (!credential) {
    throw new AppError('Credential not found', 404, 'NOT_FOUND');
  }
  
  // 解密凭据
  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(decrypt(credential.credentials));
  } catch {
    throw new AppError('Failed to decrypt credentials', 500, 'DECRYPTION_ERROR');
  }
  
  // 创建适配器获取 Zone
  const provider = createDnsProvider(credential.provider as any, credentials);
  const zones = await provider.listZones();
  
  res.success({ zones });
}));

export default router;
