import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { OrderStatus } from '@prisma/client';
import { formatDate, formatMoney, orderStatusBadge, storeSlugLabel } from './_lib/format';
import { getMerchantHealth } from '@/lib/merchant-health';

export const dynamic = 'force-dynamic';

async function getStats() {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

  const [merchantsForHealth, today, pending, recent, byStatus] = await Promise.all([
    // Pull only the columns getMerchantHealth needs so we don't drag every
    // merchant row into RAM on a busy install.
    prisma.merchant.findMany({
      select: {
        email: true,
        isActive: true,
        youcanAccessToken: true,
        whatsappFromNumber: true,
        whatsappTemplateSid: true,
      },
    }),
    prisma.order.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.order.count({ where: { status: OrderStatus.PENDING_CONFIRMATION } }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { merchant: { select: { youcanStoreSlug: true } } },
    }),
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { createdAt: { gte: weekAgo } },
    }),
  ]);

  const counts: Record<OrderStatus, number> = {
    PENDING_CONFIRMATION: 0,
    CONFIRMED: 0,
    CANCELLED: 0,
    EXPIRED: 0,
    FAILED: 0,
  };
  for (const row of byStatus) counts[row.status] = row._count._all;
  const decided = counts.CONFIRMED + counts.CANCELLED + counts.EXPIRED;
  const confirmationRate = decided === 0 ? null : (counts.CONFIRMED / decided) * 100;

  const activeMerchants = merchantsForHealth.filter((m) => m.isActive).length;
  const healthyMerchants = merchantsForHealth.filter(
    (m) => getMerchantHealth(m).ok,
  ).length;
  const needsSetup = activeMerchants - healthyMerchants;

  return {
    activeMerchants,
    healthyMerchants,
    needsSetup: needsSetup > 0 ? needsSetup : 0,
    today,
    pending,
    recent,
    counts,
    confirmationRate,
  };
}

export default async function OverviewPage() {
  const s = await getStats();

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active merchants" value={s.activeMerchants} />
        <Stat
          label="Need setup"
          value={s.needsSetup}
          accent={s.needsSetup > 0 ? 'amber' : undefined}
        />
        <Stat label="Orders today" value={s.today} />
        <Stat label="Pending right now" value={s.pending} accent="amber" />
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">
            7-day breakdown
          </h2>
          {s.confirmationRate !== null && (
            <div className="text-sm">
              Confirmation rate{' '}
              <span className="font-semibold text-emerald-700">
                {s.confirmationRate.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniStat label="Confirmed" value={s.counts.CONFIRMED} tone="emerald" />
          <MiniStat label="Cancelled" value={s.counts.CANCELLED} tone="rose" />
          <MiniStat label="Pending"   value={s.counts.PENDING_CONFIRMATION} tone="amber" />
          <MiniStat label="Expired"   value={s.counts.EXPIRED} tone="neutral" />
          <MiniStat label="Failed"    value={s.counts.FAILED} tone="red" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60">
            Recent orders
          </h2>
          <Link href="/admin/whatsapp/orders" className="text-sm text-emerald-700 hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <Th>Order</Th>
                <Th>Shop</Th>
                <Th>Customer</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {s.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-black/40">
                    No orders yet.
                  </td>
                </tr>
              )}
              {s.recent.map((o) => {
                const b = orderStatusBadge(o.status);
                return (
                  <tr key={o.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/whatsapp/orders/${o.id}`} className="text-emerald-700 hover:underline">
                        {o.youcanOrderRef}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-black/70">{storeSlugLabel(o.merchant.youcanStoreSlug)}</td>
                    <td className="px-4 py-3">{o.customerName}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(o.totalAmount, o.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>
                        {b.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-black/60">{formatDate(o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'amber' }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="text-xs uppercase tracking-wide text-black/50">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${accent === 'amber' ? 'text-amber-700' : ''}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'rose' | 'amber' | 'neutral' | 'red';
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    neutral: 'text-neutral-700',
    red: 'text-red-700',
  };
  return (
    <div className="rounded-xl border border-black/5 bg-neutral-50 px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-black/50">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tones[tone]}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
