import { DnsZone } from '../../types';

export interface DnsProviderAdapter {
  /**
   * 验证凭据是否有效
   */
  verifyCredentials(): Promise<{ valid: boolean; error?: string }>;
  
  /**
   * 列出所有 Zone（域名）
   */
  listZones(): Promise<DnsZone[]>;
  
  /**
   * 添加 TXT 记录（用于 ACME DNS-01 验证）
   * @param zone 域名（如 example.com）
   * @param name 记录名（如 _acme-challenge.subdomain）
   * @param value TXT 值
   */
  addTxtRecord(zone: string, name: string, value: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * 删除 TXT 记录
   */
  removeTxtRecord(zone: string, name: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * 查询 TXT 记录
   */
  queryTxtRecord(zone: string, name: string): Promise<string[]>;
}

export abstract class BaseDnsProvider implements DnsProviderAdapter {
  constructor(protected credentials: Record<string, string>) {}
  
  abstract verifyCredentials(): Promise<{ valid: boolean; error?: string }>;
  abstract listZones(): Promise<DnsZone[]>;
  abstract addTxtRecord(zone: string, name: string, value: string): Promise<{ success: boolean; error?: string }>;
  abstract removeTxtRecord(zone: string, name: string): Promise<{ success: boolean; error?: string }>;
  abstract queryTxtRecord(zone: string, name: string): Promise<string[]>;
  
  /**
   * 找到域名对应的 Zone
   */
  protected findZoneForDomain(zones: DnsZone[], domain: string): DnsZone | null {
    // 按名称长度降序排列，优先匹配更具体的 zone
    const sortedZones = [...zones].sort((a, b) => b.name.length - a.name.length);
    
    for (const zone of sortedZones) {
      // 检查 domain 是否以 zone.name 结尾
      if (domain === zone.name || domain.endsWith(`.${zone.name}`)) {
        return zone;
      }
    }
    
    return null;
  }
  
  /**
   * 从完整域名中提取记录名
   * @param domain 完整域名（如 _acme-challenge.sub.example.com）
   * @param zone Zone 名称（如 example.com）
   * @returns 记录名（如 _acme-challenge.sub）
   */
  protected extractRecordName(domain: string, zone: string): string {
    if (domain === zone) {
      return '@';
    }
    if (domain.endsWith(`.${zone}`)) {
      return domain.slice(0, -(zone.length + 1));
    }
    return domain;
  }
}
