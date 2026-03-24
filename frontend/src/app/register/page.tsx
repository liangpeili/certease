'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Shield, Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations('auth');
  const { login } = useAuthStore();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password strength checks
  const passwordChecks = {
    length: formData.password.length >= 8,
    letter: /[a-zA-Z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const isPasswordMatch = formData.password === formData.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid) {
      setError(t('passwordRequirements'));
      return;
    }

    if (!isPasswordMatch) {
      setError(t('passwordMismatch'));
      return;
    }

    setIsLoading(true);

    try {
      const result: any = await authApi.register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      // API interceptor returns response.data directly
      const response = result.data || result;
      const user = response.user;
      const token = response.token;
      console.log('Register response:', { user, token });
      if (!user || !token) {
        setError(t('registerError'));
        return;
      }
      login(user, token);
      router.push('/onboarding');
    } catch (err: any) {
      console.error('Register error:', err);
      setError(err.message || t('registerError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CertEase</h1>
          <p className="text-gray-500 mt-2">{t('registerTitle')}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('name')}
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('namePlaceholder')}
              required
              className="h-11"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('email')}
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('emailPlaceholder')}
              required
              className="h-11"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('password')}
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={t('passwordPlaceholder')}
                required
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            <div className="mt-3 space-y-2">
              <div className={cn(
                "flex items-center text-xs",
                passwordChecks.length ? "text-green-600" : "text-gray-500"
              )}>
                {passwordChecks.length ? <Check size={14} className="mr-1" /> : <X size={14} className="mr-1" />}
                {t('passwordRequirements').split(',')[0]}
              </div>
              <div className={cn(
                "flex items-center text-xs",
                passwordChecks.letter ? "text-green-600" : "text-gray-500"
              )}>
                {passwordChecks.letter ? <Check size={14} className="mr-1" /> : <X size={14} className="mr-1" />}
                Contains letter
              </div>
              <div className={cn(
                "flex items-center text-xs",
                passwordChecks.number ? "text-green-600" : "text-gray-500"
              )}>
                {passwordChecks.number ? <Check size={14} className="mr-1" /> : <X size={14} className="mr-1" />}
                Contains number
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('confirmPassword')}
            </label>
            <Input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder={t('confirmPasswordPlaceholder')}
              required
              className={cn(
                "h-11",
                formData.confirmPassword && !isPasswordMatch && "border-red-500"
              )}
            />
            {formData.confirmPassword && !isPasswordMatch && (
              <p className="mt-1 text-xs text-red-600">{t('passwordMismatch')}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? t('loading') : t('register')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {t('hasAccount')}{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              {t('login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
