'use client';

import { useEffect, useState } from 'react';
import { Plus, Globe, Check, X, Trash2, RefreshCw } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { dnsCredentialApi } from '@/lib/api';
import { getDnsProviderInfo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DnsCredential {
  id: string;
  name: string;
  provider: string;
  verified: boolean;
  zoneCount: number | null;
}

export default function DnsCredentialsPage() {
  const [credentials, setCredentials] = useState<DnsCredential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    provider: 'cloudflare',
    apiToken: '',
  });
  const [verifying, setVerifying] = useState<string | null>(null);

  const fetchCredentials = async () => {
    setIsLoading(true);
    try {
      const response: any = await dnsCredentialApi.list();
      setCredentials(response.data.items);
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dnsCredentialApi.create({
        name: formData.name,
        provider: formData.provider,
        credentials: { api_token: formData.apiToken },
      });
      setShowForm(false);
      setFormData({ name: '', provider: 'cloudflare', apiToken: '' });
      fetchCredentials();
    } catch (error) {
      console.error('Failed to create:', error);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      await dnsCredentialApi.verify(id);
      fetchCredentials();
    } catch (error) {
      console.error('Failed to verify:', error);
    } finally {
      setVerifying(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个凭据吗？')) return;
    try {
      await dnsCredentialApi.delete(id);
      fetchCredentials();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DNS 凭据</h1>
            <p className="text-gray-500 mt-1">管理您的 DNS 服务商 API 凭据</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            添加凭据
          </Button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">添加 DNS 凭据</h2>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  名称
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：我的 Cloudflare 账号"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  服务商
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="cloudflare">Cloudflare</option>
                  <option value="aliyun">阿里云</option>
                  <option value="tencentcloud">腾讯云</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Token
                </label>
                <Input
                  type="password"
                  value={formData.apiToken}
                  onChange={(e) => setFormData({ ...formData, apiToken: e.target.value })}
                  placeholder="输入 API Token"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  需要 Zone.DNS 编辑权限
                </p>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  保存
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  取消
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  服务商
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Zone 数量
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </td>
                </tr>
              ) : credentials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    暂无 DNS 凭据，请添加一个
                  </td>
                </tr>
              ) : (
                credentials.map((cred) => {
                  const providerInfo = getDnsProviderInfo(cred.provider);
                  return (
                    <tr key={cred.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {cred.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="flex items-center gap-2">
                          {providerInfo.icon} {providerInfo.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {cred.verified ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                            <Check className="h-4 w-4" /> 已验证
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                            <X className="h-4 w-4" /> 未验证
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {cred.zoneCount || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={verifying === cred.id}
                            onClick={() => handleVerify(cred.id)}
                          >
                            {verifying === cred.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            验证
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(cred.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
