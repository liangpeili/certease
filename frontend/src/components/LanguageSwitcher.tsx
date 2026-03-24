'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setUserLocale } from '@/i18n/utils';
import { Locale, locales, localeLabels } from '@/i18n/config';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    const newLocale = value as Locale;
    startTransition(() => {
      setUserLocale(newLocale);
      // Reload to apply new locale
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">{t('title')}:</span>
      <select
        value={locale}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeLabels[loc]}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="text-xs text-gray-400">...</span>
      )}
    </div>
  );
}
