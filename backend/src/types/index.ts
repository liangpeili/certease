// 用户角色
export type UserRole = 'owner' | 'admin' | 'viewer';

// 证书状态
export type CertificateStatus = 
  | 'pending_initial'
  | 'pending_renewal'
  | 'processing'
  | 'active'
  | 'failed'
  | 'expired'
  | 'revoked';

// DNS 服务商
export type DnsProvider = 'cloudflare' | 'aliyun' | 'tencentcloud';

// ACME 环境
export type AcmeEnvironment = 'staging' | 'production';

// 续期触发类型
export type RenewalTriggerType = 
  | 'auto_cron'
  | 'manual_single'
  | 'manual_batch'
  | 'manual_onboarding';

// 续期结果
export type RenewalResult = 'running' | 'success' | 'failed';

// Webhook 事件
export type WebhookEvent = 
  | 'renewal_success'
  | 'renewal_failed'
  | 'cert_expiring'
  | 'cert_revoked';

// API Key 权限范围
export type ApiKeyScope = 
  | 'certificates:read'
  | 'certificates:write'
  | 'certificates:download';

// 审计日志动作
export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'dns_credential.create'
  | 'dns_credential.update'
  | 'dns_credential.delete'
  | 'certificate.create'
  | 'certificate.delete'
  | 'certificate.revoke'
  | 'certificate.manual_renew'
  | 'certificate.batch_renew'
  | 'webhook.create'
  | 'webhook.update'
  | 'webhook.delete'
  | 'api_key.create'
  | 'api_key.delete'
  | 'settings.update';

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// 统一响应格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    size?: number;
    total?: number;
  };
}

// DNS 凭据配置（解密后）
export interface CloudflareCredentials {
  api_token?: string;
  api_key?: string;
  email?: string;
}

export interface AliyunCredentials {
  access_key_id: string;
  access_key_secret: string;
}

export interface TencentCredentials {
  secret_id: string;
  secret_key: string;
}

export type DnsCredentials = CloudflareCredentials | AliyunCredentials | TencentCredentials;

// DNS Zone
export interface DnsZone {
  id: string;
  name: string;
}

// 证书下载格式
export type CertificateFormat = 'pem' | 'pfx' | 'nginx';

// 续期日志步骤
export interface RenewalStep {
  step: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  started_at?: string;
  finished_at?: string;
  message?: string;
  detail?: string;
  error?: string;
  error_detail?: string;
}
