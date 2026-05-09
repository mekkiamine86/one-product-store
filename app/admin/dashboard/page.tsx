'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ProductEditor from '@/components/admin/ProductEditor';
import OrdersTable from '@/components/admin/OrdersTable';

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'orders' | 'product'>('orders');

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/admin');
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
              م
            </div>
            <div>
              <div className="text-sm font-semibold text-black">لوحة التحكم</div>
              <div className="text-xs text-black/50">إدارة المتجر</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-black hover:text-white sm:inline-flex"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              عرض المتجر
            </a>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-900"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="flex gap-1 border-b border-transparent">
            <TabButton active={tab === 'orders'} onClick={() => setTab('orders')}>
              الطلبات
            </TabButton>
            <TabButton active={tab === 'product'} onClick={() => setTab('product')}>
              المنتج
            </TabButton>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-10">
        {tab === 'orders' ? <OrdersTable /> : <ProductEditor />}
      </div>
    </main>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-5 py-3 text-sm font-medium transition-colors ${
        active ? 'text-black' : 'text-black/50 hover:text-black'
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-black" />
      )}
    </button>
  );
}
