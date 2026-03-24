import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// API 基础 URL
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// 格式化日期
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 格式化相对时间
export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

// 获取证书状态颜色和文本
export function getCertificateStatus(status: string): {
  color: string;
  bgColor: string;
  text: string;
  icon: string;
} {
  switch (status) {
    case 'active':
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        text: '生效中',
        icon: '●',
      };
    case 'pending_renewal':
      return {
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        text: '排队中',
        icon: '⏳',
      };
    case 'processing':
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        text: '申请中',
        icon: '⟳',
      };
    case 'failed':
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        text: '失败',
        icon: '✕',
      };
    case 'expired':
      return {
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        text: '已过期',
        icon: '⚠',
      };
    case 'revoked':
      return {
        color: 'text-red-800',
        bgColor: 'bg-red-100',
        text: '已吊销',
        icon: '⛔',
      };
    case 'pending_initial':
      return {
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        text: '待签发',
        icon: '⏸',
      };
    default:
      return {
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        text: status,
        icon: '?',
      };
  }
}

// 计算剩余天数颜色
export function getDaysRemainingColor(days: number): string {
  if (days < 0) return 'text-gray-500';
  if (days < 7) return 'text-red-600 font-bold';
  if (days < 30) return 'text-yellow-600';
  return 'text-green-600';
}

// DNS 服务商图标/名称
export function getDnsProviderInfo(provider: string): { name: string; icon: string } {
  switch (provider) {
    case 'cloudflare':
      return { name: 'Cloudflare', icon: '🌐' };
    case 'aliyun':
      return { name: '阿里云', icon: '☁️' };
    case 'tencentcloud':
      return { name: '腾讯云', icon: '🏢' };
    default:
      return { name: provider, icon: '🔧' };
  }
}
