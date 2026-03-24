import { DnsProviderAdapter } from './base';
import { CloudflareProvider } from './cloudflare';
import { DnsProvider } from '../../types';

export * from './base';
export { CloudflareProvider } from './cloudflare';

export function createDnsProvider(provider: DnsProvider, credentials: Record<string, string>): DnsProviderAdapter {
  switch (provider) {
    case 'cloudflare':
      return new CloudflareProvider(credentials);
    // 后续添加阿里云、腾讯云适配器
    // case 'aliyun':
    //   return new AliyunProvider(credentials);
    // case 'tencentcloud':
    //   return new TencentCloudProvider(credentials);
    default:
      throw new Error(`Unsupported DNS provider: ${provider}`);
  }
}
