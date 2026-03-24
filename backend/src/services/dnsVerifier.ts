import dns from 'dns';
import { promisify } from 'util';

const resolveTxt = promisify(dns.resolveTxt);

// DNS 服务器列表用于轮询
const DNS_SERVERS = [
  '8.8.8.8',   // Google
  '1.1.1.1',   // Cloudflare
  '8.8.4.4',   // Google secondary
  '1.0.0.1',   // Cloudflare secondary
];

export class DnsVerifier {
  private maxWaitTime: number; // 最大等待时间（毫秒）
  private checkInterval: number; // 检查间隔（毫秒）

  constructor(options: { maxWaitTime?: number; checkInterval?: number } = {}) {
    this.maxWaitTime = options.maxWaitTime || 5 * 60 * 1000; // 默认 5 分钟
    this.checkInterval = options.checkInterval || 10 * 1000; // 默认 10 秒
  }

  /**
   * 等待 DNS TXT 记录生效
   * @param recordName 记录名（如 _acme-challenge.example.com）
   * @param expectedValue 期望的 TXT 值
   * @returns 是否成功
   */
  async waitForTxtRecord(recordName: string, expectedValue: string): Promise<{
    success: boolean;
    waitedMs: number;
    checkedServers: string[];
    foundValues?: string[];
  }> {
    const startTime = Date.now();
    const checkedServers: string[] = [];

    while (Date.now() - startTime < this.maxWaitTime) {
      const results = await this.checkAllServers(recordName);
      
      for (const result of results) {
        if (!checkedServers.includes(result.server)) {
          checkedServers.push(result.server);
        }
        
        if (result.values.includes(expectedValue)) {
          return {
            success: true,
            waitedMs: Date.now() - startTime,
            checkedServers,
            foundValues: result.values,
          };
        }
      }

      // 等待后重试
      await this.sleep(this.checkInterval);
    }

    // 超时
    return {
      success: false,
      waitedMs: Date.now() - startTime,
      checkedServers,
    };
  }

  /**
   * 查询 TXT 记录
   */
  async queryTxtRecord(recordName: string, server?: string): Promise<string[]> {
    try {
      const resolver = new dns.Resolver();
      
      if (server) {
        resolver.setServers([server]);
      }
      
      const resolveTxtAsync = promisify(resolver.resolveTxt.bind(resolver));
      const records = await resolveTxtAsync(recordName);
      
      // DNS TXT 记录返回的是字符串数组的数组，展平
      return records.flat();
    } catch (error) {
      // 记录不存在或查询失败
      return [];
    }
  }

  /**
   * 检查所有 DNS 服务器
   */
  private async checkAllServers(recordName: string): Promise<
    { server: string; values: string[] }[]
  > {
    const results = await Promise.all(
      DNS_SERVERS.map(async (server) => {
        const values = await this.queryTxtRecord(recordName, server);
        return { server, values };
      })
    );

    return results;
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 验证域名归属（检查域名是否在 Zone 列表中）
   */
  static verifyDomainOwnership(domain: string, zones: { name: string }[]): boolean {
    const domainParts = domain.split('.');
    
    // 尝试匹配各级域名
    for (let i = 0; i < domainParts.length - 1; i++) {
      const zoneName = domainParts.slice(i).join('.');
      if (zones.some((z) => z.name === zoneName)) {
        return true;
      }
    }
    
    return false;
  }
}
