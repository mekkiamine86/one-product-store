import Link from 'next/link';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin/whatsapp', label: 'Overview' },
  { href: '/admin/whatsapp/orders', label: 'Orders' },
  { href: '/admin/whatsapp/merchants', label: 'Merchants' },
];

export default function WhatsAppAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900" dir="ltr">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              W
            </div>
            <div>
              <div className="text-sm font-semibold">WhatsApp COD</div>
              <div className="text-xs text-black/50">Order-confirmation SaaS</div>
            </div>
          </div>
          <Link
            href="/admin/dashboard"
            className="text-xs text-black/60 hover:text-black"
          >
            ← Back to store admin
          </Link>
        </div>
        <nav className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="flex gap-1 border-b border-transparent">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-3 text-sm font-medium text-black/60 hover:text-black"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">{children}</main>
    </div>
  );
}
