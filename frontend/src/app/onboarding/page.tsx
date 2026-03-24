'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle, Globe, Shield, Key } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations();

  const steps = [
    {
      icon: Key,
      title: t('onboarding.step1.title'),
      description: t('onboarding.step1.description'),
      action: t('dnsCredentials.addCredential'),
      href: '/dns-credentials',
      color: 'bg-blue-100 text-blue-600',
    },
    {
      icon: Globe,
      title: t('onboarding.step2.title'),
      description: t('onboarding.step2.description'),
      action: t('certificates.addCertificate'),
      href: '/certificates/new',
      color: 'bg-green-100 text-green-600',
    },
    {
      icon: Shield,
      title: t('onboarding.step3.title'),
      description: t('onboarding.step3.description'),
      action: t('nav.certificates'),
      href: '/certificates',
      color: 'bg-purple-100 text-purple-600',
    },
  ];

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {t('onboarding.title')}
          </h1>
          <p className="text-gray-600 text-lg">
            {t('onboarding.subtitle')}
          </p>
        </div>

        <div className="grid gap-6">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow"
            >
              <div
                className={`flex-shrink-0 w-12 h-12 rounded-lg ${step.color} flex items-center justify-center`}
              >
                <step.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-sm font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {step.title}
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">{step.description}</p>
                <Link href={step.href}>
                  <Button variant="outline" className="gap-2">
                    {step.action}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/dashboard">
            <Button variant="ghost" className="text-gray-500">
              {t('onboarding.skip')}
            </Button>
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}
