'use client';

import MainLayout from '@/components/layout/MainLayout';

export default function WebhooksPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhook 配置</h1>
          <p className="text-gray-500 mt-1">配置证书续期通知的 Webhook</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">此功能正在开发中</p>
        </div>
      </div>
    </MainLayout>
  );
}
