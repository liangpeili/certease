'use client';

import MainLayout from '@/components/layout/MainLayout';

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          <p className="text-gray-500 mt-1">系统设置和偏好</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">此功能正在开发中</p>
        </div>
      </div>
    </MainLayout>
  );
}
