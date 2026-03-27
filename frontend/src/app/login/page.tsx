'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Sparkles } from 'lucide-react';
import { api, setToken } from '@/lib/api';
import { FlowPulseLogo } from '@/components/brand-logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState('Admin@flowpulse.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      const isNew = searchParams.get('new') === 'true';
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') ? redirect : '/dashboard';
      router.replace(isNew ? '/onboarding' : safeRedirect);
    }
  }, [searchParams, router]);

  const onAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.adminLogin(email, password);
      setToken(result.token);
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') ? redirect : '/dashboard/admin';
      router.replace(safeRedirect);
    } catch (err: any) {
      setError(err?.message || 'Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-5 py-10 md:px-8">
      <div className="grid w-full items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <div className="reveal-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            Secure OAuth onboarding
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight [font-family:var(--font-heading)] md:text-5xl">
            Sign in to your FlowPulse workspace.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 md:text-base">
            FlowPulse helps engineering leaders detect overload patterns early while preserving trust across the team.
          </p>
        </div>

        <div className="glass-header reveal-up p-7 md:p-8" style={{ animationDelay: '0.08s' }}>
          <div className="mb-6">
            <FlowPulseLogo />
          </div>

          <a
            href={`${API_URL}/auth/google`}
            className="btn-primary w-full gap-3 py-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </a>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-slate-400">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={onAdminLogin} className="space-y-3">
            <input
              type="email"
              className="input"
              placeholder="Admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="btn-secondary w-full py-2.5 text-sm">
              {loading ? 'Signing in...' : 'Admin Login'}
            </button>
          </form>

          <div className="panel glass-tint-emerald mt-5 p-3 text-xs text-emerald-50">
            <p className="inline-flex items-center gap-1.5 font-semibold">
              <Shield className="h-3.5 w-3.5" />
              Privacy guarantee
            </p>
            <p className="mt-1 text-emerald-100/80">We never read message content or meeting titles.</p>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            By signing in, you agree to our{' '}
            <Link href="/privacy" className="font-semibold text-cyan-200 hover:text-white">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginContent />
    </Suspense>
  );
}
