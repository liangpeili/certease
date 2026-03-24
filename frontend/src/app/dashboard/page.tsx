'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle,
  RefreshCw,
  Activity,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { certificateApi } from '@/lib/api';
import {
  getCertificateStatus,
  getDaysRemainingColor,
  formatRelativeTime,
  formatDate,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface DashboardSummary {
  total: number;
  byStatus: Record<string, number>;
  expiring7d: number;
  expiring30d: number;
  hasProcessing: boolean;
  recentLogs: any[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      const response: any = await certificateApi.getSummary();
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // 如果有正在处理的证书，轮询更新
  useEffect(() => {
    if (!summary?.hasProcessing) return;

    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, [summary?.hasProcessing]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </MainLayout>
    );
  }

  const statCards = [
    {
      title: '证书总数',
      value: summary?.total || 0,
      color: 'blue',
      icon: Shield,
      href: '/certificates',
    },
    {
      title: '即将到期 (≤30天)',
      value: summary?.expiring30d || 0,
      color: 'yellow',
      icon: Clock,
      href: '/certificates?filter=expiring',
    },
    {
      title: '续期失败',
      value: summary?.byStatus?.failed || 0,
      color: 'red',
      icon: AlertCircle,
      href: '/certificates?status=failed',
    },
    {
      title: '已过期',
      value: summary?.byStatus?.expired || 0,
      color: 'gray',
      icon: AlertTriangle,
      href: '/certificates?status=expired',
    },
  ];

  const getColorClass = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-50 border-blue-200 text-blue-700',
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      red: 'bg-red-50 border-red-200 text-red-700',
      gray: 'bg-gray-50 border-gray-200 text-gray-700',
    };
    return colors[color] || colors.blue;
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">概览您的 SSL 证书状态</p>
          </div>
          <Button
            variant="outline"
            onClick={fetchSummary}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} />
            刷新
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`p-6 rounded-xl border-2 transition-all hover:shadow-md ${getColorClass(card.color)}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium opacity-80">{card.title}</p>
                  <p className="text-3xl font-bold mt-2">{card.value}</p>
                </div>
                <card.icon className="h-10 w-10 opacity-50" />
              </div>
            </Link>
          ))}
        </div>

        {/* 即将到期列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">即将到期的证书</h2>
          </div>
          <div className="p-6">
            {summary && summary.expiring7d === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                所有证书状态健康，暂无即将到期的证书
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                查看证书列表获取详细信息
              </div>
            )}
          </div>
        </div>

        {/* 最近活动 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">最近活动</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {summary?.recentLogs && summary.recentLogs.length > 0 ? (
              summary.recentLogs.map((log) => {
                const status = getCertificateStatus(
                  log.result === 'success' ? 'active' : 'failed'
                );
                return (
                  <div
                    key={log.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className={status.color}>{status.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {log.domain} - {log.result === 'success' ? '续期成功' : '续期失败'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {log.triggerType === 'auto_cron'
                            ? '自动巡检'
                            : log.triggerType === 'manual_single'
                            ? '手动触发'
                            : '批量续期'}
                          {log.durationMs && ` · 耗时 ${Math.round(log.durationMs / 1000)}s`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatRelativeTime(log.finishedAt)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">
                暂无活动记录
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
