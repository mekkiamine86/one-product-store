'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

      const next = params.get('next') || '/admin/dashboard';
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black">
          <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-black">لوحة التحكم</h1>
        <p className="mt-2 text-sm text-black/60">
          أدخل كلمة المرور للمتابعة
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-black/80">كلمة المرور</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
          disabled={submitting}
          className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-base text-black placeholder:text-black/30 transition-colors focus:border-black focus:outline-none disabled:opacity-60"
          placeholder="••••••••"
        />
      </label>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !password}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-8 py-3.5 text-base font-medium text-white transition-all hover:bg-neutral-900 disabled:opacity-60"
      >
        {submitting ? (
          <>
            <span className="spinner" />
            <span>جارٍ التحقق...</span>
          </>
        ) : (
          'دخول'
        )}
      </button>

      <a
        href="/"
        className="mt-6 block text-center text-sm text-black/50 transition-colors hover:text-black"
      >
        ← العودة للمتجر
      </a>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
