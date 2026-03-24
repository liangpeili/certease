'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Check, X, Trash2, RefreshCw } from 'lucide-react';
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
  const t = useTranslations();
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
    if (!confirm(t('common.confirm'))) return;
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
            <h1 className="text-2xl font-bold text-gray-900">{t('dnsCredentials.title')}</h1>
            <p className="text-gray-500 mt-1">{t('dnsCredentials.subtitle')}</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('dnsCredentials.addCredential')}
          </Button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">{t('dnsCredentials.create.title')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dnsCredentials.create.name')}
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('dnsCredentials.create.namePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.name')}
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="cloudflare">Cloudflare</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('dnsCredentials.create.apiToken')}
                </label>
                <Input
                  type="password"
                  value={formData.apiToken}
                  onChange={(e) => setFormData({ ...formData, apiToken: e.target.value })}
                  placeholder={t('dnsCredentials.create.apiTokenPlaceholder')}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('dnsCredentials.create.apiTokenHint')}
                </p>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {t('common.save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  {t('common.cancel')}
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
                  {t('common.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('dnsCredentials.provider')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('dnsCredentials.zoneCount')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  {t('common.actions')}
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
                    {t('dnsCredentials.noCredentials')}
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
                            <Check className="h-4 w-4" /> {t('dnsCredentials.verified')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 text-sm">
                            <X className="h-4 w-4" /> {t('dnsCredentials.unverified')}
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
                            {t('dnsCredentials.verify')}
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
