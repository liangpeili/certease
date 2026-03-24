import { z } from 'zod';

// 邮箱校验
export const emailSchema = z.string().email('Invalid email format');

// 密码校验：至少8位，包含字母和数字
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// 注册请求
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
});

// 登录请求
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// DNS 凭据创建
export const createDnsCredentialSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: z.enum(['cloudflare', 'aliyun', 'tencentcloud']),
  credentials: z.record(z.string()),
});

// DNS 凭据更新
export const updateDnsCredentialSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credentials: z.record(z.string()).optional(),
});

// 域名校验
export const domainSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(255, 'Domain is too long')
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    'Invalid domain format'
  );

// 证书创建
export const createCertificateSchema = z.object({
  domain: domainSchema,
  dns_credential_id: z.string().uuid(),
  is_wildcard: z.boolean().default(false),
  auto_renew: z.boolean().default(true),
  renew_before_days: z.number().int().min(7).max(60).default(30),
  issue_now: z.boolean().default(true),
  webhook_ids: z.array(z.string().uuid()).optional(),
});

// 证书更新
export const updateCertificateSchema = z.object({
  auto_renew: z.boolean().optional(),
  renew_before_days: z.number().int().min(7).max(60).optional(),
  webhook_ids: z.array(z.string().uuid()).optional(),
});

// 批量续期
export const batchRenewSchema = z.object({
  cert_ids: z.array(z.string().uuid()).min(1, 'At least one certificate is required'),
});

// 吊销证书
export const revokeCertificateSchema = z.object({
  reason: z.enum(['key_compromise', 'cessation_of_operation', 'superseded', 'unspecified']),
});

// Webhook 配置创建
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url('Invalid URL'),
  events: z.array(z.enum(['renewal_success', 'renewal_failed', 'cert_expiring', 'cert_revoked'])),
  certificate_ids: z.array(z.string().uuid()).optional().nullable(),
});

// Webhook 更新
export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(['renewal_success', 'renewal_failed', 'cert_expiring', 'cert_revoked'])).optional(),
  certificate_ids: z.array(z.string().uuid()).optional().nullable(),
  enabled: z.boolean().optional(),
});

// API Key 创建
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['certificates:read', 'certificates:write', 'certificates:download'])),
  expires_at: z.string().datetime().optional().nullable(),
});

// 域名归属检查
export const checkDomainSchema = z.object({
  domain: domainSchema,
  dns_credential_id: z.string().uuid(),
});

// 分页查询
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

// 证书列表查询
export const certificateListQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'pending_initial', 'pending_renewal', 'processing', 'failed', 'expired', 'revoked']).optional(),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'expiresAt', 'domain']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// 吊销原因映射（用于 ACME 吊销）
export const revocationReasonMap: Record<string, number> = {
  unspecified: 0,
  key_compromise: 1,
  ca_compromise: 2,
  affiliation_changed: 3,
  superseded: 4,
  cessation_of_operation: 5,
  certificate_hold: 6,
  remove_from_crl: 8,
  privilege_withdrawn: 9,
  aa_compromise: 10,
};
