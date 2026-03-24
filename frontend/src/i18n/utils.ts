'use server';

import { cookies, headers } from 'next/headers';
import { Locale, defaultLocale, locales } from './config';

const COOKIE_NAME = 'NEXT_LOCALE';

/**
 * 从 Accept-Language 头检测浏览器语言
 */
function detectBrowserLocale(): Locale {
  const headersList = headers();
  const acceptLanguage = headersList.get('accept-language') || '';
  
  // 解析 Accept-Language，例如: "zh-CN,zh;q=0.9,en;q=0.8"
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, q] = lang.split(';q=');
      return {
        code: code?.trim().toLowerCase() || '',
        q: q ? parseFloat(q) : 1,
      };
    })
    .sort((a, b) => b.q - a.q);
  
  // 检查是否有中文（zh 开头）
  const hasChinese = languages.some(lang => lang.code.startsWith('zh'));
  
  if (hasChinese) {
    return 'zh';
  }
  
  // 其他情况返回默认语言（英文）
  return defaultLocale;
}

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(COOKIE_NAME)?.value as Locale;
  
  // 如果 cookie 中有有效的语言设置，优先使用
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }
  
  // 否则检测浏览器语言
  return detectBrowserLocale();
}

export async function setUserLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, locale, {
    maxAge: 365 * 24 * 60 * 60, // 1 year
    path: '/',
  });
}
