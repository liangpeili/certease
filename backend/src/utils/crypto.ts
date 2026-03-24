import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// 从环境变量获取加密密钥，如果没有则生成一个（仅用于开发）
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (key) {
    // 如果提供了密钥，使用 SHA-256 哈希得到 32 字节
    return crypto.createHash('sha256').update(key).digest();
  }
  // 开发环境：生成一个随机密钥（重启后会丢失数据！）
  console.warn('WARNING: ENCRYPTION_KEY not set, using random key. Data will be lost on restart!');
  return crypto.randomBytes(KEY_LENGTH);
}

const encryptionKey = getEncryptionKey();

/**
 * 加密文本
 * @param text 要加密的文本
 * @returns 加密后的字符串 (base64 编码，包含 IV 和 auth tag)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // 格式: iv:authTag:encryptedData (都使用 base64)
  const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  return result;
}

/**
 * 解密文本
 * @param encryptedData 加密后的字符串
 * @returns 解密后的原文
 */
export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * 哈希密码
 * @param password 明文密码
 * @returns bcrypt 哈希值
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * 验证密码
 * @param password 明文密码
 * @param hash 哈希值
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}

/**
 * 生成 API Key
 * @returns 原始 API Key（只返回一次）和哈希值
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 8);
  return { key, hash, prefix };
}

/**
 * 验证 API Key
 * @param key 原始 API Key
 * @param hash 存储的哈希值
 * @returns 是否匹配
 */
export function verifyApiKey(key: string, hash: string): boolean {
  const computedHash = crypto.createHash('sha256').update(key).digest('hex');
  return computedHash === hash;
}

/**
 * 生成 Webhook 密钥
 * @returns HMAC 密钥
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * 计算 Webhook 签名
 * @param payload 请求体
 * @param secret 密钥
 * @returns HMAC-SHA256 签名
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 生成随机 ID
 * @returns UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}
