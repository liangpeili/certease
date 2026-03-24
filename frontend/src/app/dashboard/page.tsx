'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations();
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
      title: t('dashboard.totalCertificates'),
      value: summary?.total || 0,
      color: 'blue',
      icon: Shield,
      href: '/certificates',
    },
    {
      title: t('dashboard.expiringSoon'),
      value: summary?.expiring30d || 0,
      color: 'yellow',
      icon: Clock,
      href: '/certificates?filter=expiring',
    },
    {
      title: t('dashboard.renewalFailed'),
      value: summary?.byStatus?.failed || 0,
      color: 'red',
      icon: AlertCircle,
      href: '/certificates?status=failed',
    },
    {
      title: t('dashboard.expired'),
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
            <p className="text-gray-500 mt-1">{t('dashboard.subtitle')}</p>
          </div>
          <Button
            variant="outline"
            onClick={fetchSummary}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} />
            {t('common.refresh')}
          </Button>
        </div>

        {/* Stat Cards */}
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

        {/* Expiring Soon */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.expiringSoon')}</h2>
          </div>
          <div className="p-6">
            {summary && summary.expiring7d === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                {t('dashboard.healthyStatus')}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                View certificate list for details
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.recentActivity')}</h2>
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
                          {log.domain} - {log.result === 'success' ? 'Success' : 'Failed'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {log.triggerType === 'auto_cron'
                            ? 'Auto'
                            : log.triggerType === 'manual_single'
                            ? 'Manual'
                            : 'Batch'}
                          {log.durationMs && ` · ${Math.round(log.durationMs / 1000)}s`}
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
                {t('dashboard.noActivity')}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
