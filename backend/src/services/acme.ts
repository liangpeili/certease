import * as acme from 'acme-client';
import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from '../utils/crypto';
import { AcmeEnvironment } from '../types';

const DIRECTORY_URLS = {
  staging: acme.directory.letsencrypt.staging,
  production: acme.directory.letsencrypt.production,
};

export class AcmeService {
  private client: acme.Client | null = null;
  private accountKey: string | null = null;

  constructor(
    private prisma: PrismaClient,
    private accountId: string,
    private environment: AcmeEnvironment = 'staging'
  ) {}

  /**
   * 初始化 ACME 客户端
   */
  async initialize(): Promise<void> {
    // 获取账户信息
    const account = await this.prisma.acmeAccount.findUnique({
      where: { id: this.accountId },
    });

    if (!account) {
      throw new Error(`ACME account not found: ${this.accountId}`);
    }

    // 解密私钥
    this.accountKey = decrypt(account.privateKey);

    // 创建客户端
    this.client = new acme.Client({
      directoryUrl: DIRECTORY_URLS[this.environment],
      accountKey: Buffer.from(this.accountKey),
      accountUrl: account.accountUrl || undefined,
    });

    // 如果还没有注册账户，则注册
    if (!account.accountUrl) {
      await this.registerAccount(account.email);
    }
  }

  /**
   * 注册 ACME 账户
   */
  private async registerAccount(email: string): Promise<void> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    try {
      // 创建账户
      await this.client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${email}`],
      });

      // 保存账户 URL
      await this.prisma.acmeAccount.update({
        where: { id: this.accountId },
        data: { accountUrl: this.client.getAccountUrl() },
      });
    } catch (error) {
      throw new Error(`Failed to register ACME account: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * 创建证书订单
   */
  async createOrder(domains: string[]): Promise<acme.Order> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    const order = await this.client.createOrder({
      identifiers: domains.map((domain) => ({ type: 'dns', value: domain })),
    });

    return order;
  }

  /**
   * 获取订单的授权
   */
  async getAuthorizations(order: acme.Order): Promise<acme.Authorization[]> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    const authorizations = await this.client.getAuthorizations(order);
    return authorizations;
  }

  /**
   * 获取 DNS-01 Challenge
   */
  getDnsChallenge(authz: acme.Authorization): any {
    return authz.challenges.find((c: any) => c.type === 'dns-01') || null;
  }

  /**
   * 获取 DNS-01 验证的 KEY 授权值
   */
  async getDnsChallengeKeyAuthorization(challenge: any): Promise<string> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    return await this.client.getChallengeKeyAuthorization(challenge);
  }

  /**
   * 完成验证
   */
  async completeChallenge(challenge: any): Promise<void> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    await this.client.completeChallenge(challenge);
  }

  /**
   * 等待验证完成
   */
  async waitForValidation(challenge: any): Promise<void> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    await this.client.waitForValidStatus(challenge);
  }

  /**
   * 最终化订单（提交 CSR）
   */
  async finalizeOrder(order: acme.Order, csr: Buffer): Promise<void> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    await this.client.finalizeOrder(order, csr);
  }

  /**
   * 获取证书
   */
  async getCertificate(order: acme.Order): Promise<string> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    const cert = await this.client.getCertificate(order);
    return cert;
  }

  /**
   * 吊销证书
   */
  async revokeCertificate(certPem: string, reason: number = 0): Promise<void> {
    if (!this.client) {
      throw new Error('ACME client not initialized');
    }

    await this.client.revokeCertificate(certPem, { reason });
  }

  /**
   * 生成 CSR
   */
  static async generateCsr(domains: string[]): Promise<{ csr: Buffer; privateKey: string }> {
    const [key, csr] = await acme.forge.createCsr({
      commonName: domains[0],
      altNames: domains,
    });

    return {
      csr,
      privateKey: key.toString(),
    };
  }

  /**
   * 创建新的 ACME 账户
   */
  static async createAccount(
    prisma: PrismaClient,
    userId: string,
    email: string,
    environment: AcmeEnvironment = 'staging'
  ): Promise<string> {
    // 生成账户密钥对
    const accountKey = (await acme.forge.createPrivateKey(2048)).toString();

    // 加密存储
    const encryptedKey = encrypt(accountKey);

    // 创建记录
    const account = await prisma.acmeAccount.create({
      data: {
        userId,
        email,
        privateKey: encryptedKey,
        environment,
      },
    });

    return account.id;
  }
}
