'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Shield,
  Globe,
  Settings,
  Webhook,
} from 'lucide-react';
import LanguageSwitcher from '../LanguageSwitcher';

export default function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  const navigation = [
    { name: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('certificates'), href: '/certificates', icon: Shield },
    { name: t('dnsCredentials'), href: '/dns-credentials', icon: Globe },
    { name: t('webhooks'), href: '/webhooks', icon: Webhook },
    { name: t('settings'), href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 text-white">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <Shield className="h-8 w-8 text-blue-400 mr-3" />
        <span className="text-xl font-bold">CertEase</span>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-800 space-y-4">
        <LanguageSwitcher />
        <div className="text-xs text-slate-500 text-center">
          CertEase v1.0
        </div>
      </div>
    </div>
  );
}
