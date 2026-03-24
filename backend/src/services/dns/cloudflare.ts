import { BaseDnsProvider } from './base';
import { DnsZone } from '../../types';

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

interface CloudflareApiResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message: string }>;
}

export class CloudflareProvider extends BaseDnsProvider {
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  private headers: Record<string, string>;
  
  constructor(credentials: Record<string, string>) {
    super(credentials);
    
    if (credentials.api_token) {
      this.headers = {
        'Authorization': `Bearer ${credentials.api_token}`,
        'Content-Type': 'application/json',
      };
    } else if (credentials.api_key && credentials.email) {
      this.headers = {
        'X-Auth-Key': credentials.api_key,
        'X-Auth-Email': credentials.email,
        'Content-Type': 'application/json',
      };
    } else {
      throw new Error('Cloudflare credentials must include api_token or api_key + email');
    }
  }
  
  async verifyCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/user/tokens/verify`, {
        headers: this.headers,
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid API token or key' };
        }
        return { valid: false, error: `API error: ${response.status}` };
      }
      
      const data = await response.json() as CloudflareApiResponse<any>;
      if (!data.success) {
        return { valid: false, error: data.errors?.[0]?.message || 'Unknown error' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
  }
  
  async listZones(): Promise<DnsZone[]> {
    const response = await fetch(`${this.baseUrl}/zones?per_page=500`, {
      headers: this.headers,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list zones: ${response.status}`);
    }
    
    const data = await response.json() as CloudflareApiResponse<CloudflareZone[]>;
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || 'Failed to list zones');
    }
    
    return data.result
      .filter((zone: CloudflareZone) => zone.status === 'active')
      .map((zone: CloudflareZone) => ({
        id: zone.id,
        name: zone.name,
      }));
  }
  
  async addTxtRecord(zone: string, name: string, value: string): Promise<{ success: boolean; error?: string }> {
    try {
      const zones = await this.listZones();
      const zoneObj = this.findZoneForDomain(zones, zone);
      
      if (!zoneObj) {
        return { success: false, error: `Zone not found for domain: ${zone}` };
      }
      
      const recordName = this.extractRecordName(name, zoneObj.name);
      const fullRecordName = recordName === '@' ? zoneObj.name : `${recordName}.${zoneObj.name}`;
      
      // 先检查是否已存在相同的记录
      const existingRecords = await this.queryTxtRecord(zone, name);
      if (existingRecords.includes(value)) {
        return { success: true }; // 记录已存在
      }
      
      const response = await fetch(`${this.baseUrl}/zones/${zoneObj.id}/dns_records`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          type: 'TXT',
          name: fullRecordName,
          content: value,
          ttl: 60, // 短 TTL 便于快速验证
        }),
      });
      
      if (!response.ok) {
        const error = await response.json() as CloudflareApiResponse<any>;
        return { success: false, error: error.errors?.[0]?.message || `HTTP ${response.status}` };
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  async removeTxtRecord(zone: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const zones = await this.listZones();
      const zoneObj = this.findZoneForDomain(zones, zone);
      
      if (!zoneObj) {
        return { success: false, error: `Zone not found for domain: ${zone}` };
      }
      
      // 查找记录
      const recordName = this.extractRecordName(name, zoneObj.name);
      const fullRecordName = recordName === '@' ? zoneObj.name : `${recordName}.${zoneObj.name}`;
      
      const response = await fetch(
        `${this.baseUrl}/zones/${zoneObj.id}/dns_records?type=TXT&name=${encodeURIComponent(fullRecordName)}`,
        { headers: this.headers }
      );
      
      if (!response.ok) {
        return { success: false, error: `Failed to query records: ${response.status}` };
      }
      
      const data = await response.json() as CloudflareApiResponse<CloudflareDnsRecord[]>;
      if (!data.success || !data.result) {
        return { success: false, error: 'Failed to query records' };
      }
      
      // 删除所有匹配的记录
      for (const record of data.result) {
        const deleteResponse = await fetch(
          `${this.baseUrl}/zones/${zoneObj.id}/dns_records/${record.id}`,
          { method: 'DELETE', headers: this.headers }
        );
        
        if (!deleteResponse.ok) {
          console.error(`Failed to delete record ${record.id}: ${deleteResponse.status}`);
        }
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  async queryTxtRecord(zone: string, name: string): Promise<string[]> {
    try {
      const zones = await this.listZones();
      const zoneObj = this.findZoneForDomain(zones, zone);
      
      if (!zoneObj) {
        return [];
      }
      
      const recordName = this.extractRecordName(name, zoneObj.name);
      const fullRecordName = recordName === '@' ? zoneObj.name : `${recordName}.${zoneObj.name}`;
      
      const response = await fetch(
        `${this.baseUrl}/zones/${zoneObj.id}/dns_records?type=TXT&name=${encodeURIComponent(fullRecordName)}`,
        { headers: this.headers }
      );
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json() as CloudflareApiResponse<CloudflareDnsRecord[]>;
      if (!data.success || !data.result) {
        return [];
      }
      
      return data.result.map((record: CloudflareDnsRecord) => record.content);
    } catch {
      return [];
    }
  }
}
