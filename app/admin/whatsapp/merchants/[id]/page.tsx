import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatDate, formatMoney, orderStatusBadge, storeSlugLabel } from '../../_lib/format';
import SettingsForm from './SettingsForm';
import ResubscribeButton from './ResubscribeButton';
import DeleteMerchantButton from './DeleteMerchantButton';

export const dynamic = 'force-dynamic';

export default async function MerchantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { orders: true } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
  });
  if (!merchant) notFound();

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {merchant.youcanStoreSlug?.trim() || (
              <span className="text-black/40">{storeSlugLabel(merchant.youcanStoreSlug)}</span>
            )}
          </h1>
          {merchant.isActive ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
              Inactive
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-black/60">
          Installed {formatDate(merchant.createdAt)} · {merchant._count.orders.toLocaleString()} order
          {merchant._count.orders === 1 ? '' : 's'}
        </div>
      </header>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-black/60">
          WhatsApp settings
        </h2>
        <SettingsForm
          merchantId={merchant.id}
          initial={{
            email: merchant.email,
            name: merchant.name ?? '',
            youcanStoreSlug: merchant.youcanStoreSlug ?? '',
            whatsappFromNumber: merchant.whatsappFromNumber,
            whatsappTemplateSid: merchant.whatsappTemplateSid ?? '',
            defaultCountryCode: merchant.defaultCountryCode,
            youcanConfirmedSlug: merchant.youcanConfirmedSlug,
            youcanCancelledSlug: merchant.youcanCancelledSlug,
            isActive: merchant.isActive,
          }}
          youcanStoreId={merchant.youcanStoreId}
        />
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-black/60">
          YouCan webhooks
        </h2>
        <p className="mb-4 text-xs text-black/60">
          Re-registers the <code className="rounded bg-neutral-100 px-1.5 py-0.5">order.create</code>{' '}
          and <code className="rounded bg-neutral-100 px-1.5 py-0.5">app.uninstalled</code> REST
          Hook subscriptions with YouCan, using this merchant's current access token. Safe to fire
          repeatedly — duplicates are ignored.
        </p>
        <ResubscribeButton merchantId={merchant.id} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/60">
          Recent orders
        </h2>
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {merchant.orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-black/40">
                    No orders yet.
                  </td>
                </tr>
              )}
              {merchant.orders.map((o) => {
                const b = orderStatusBadge(o.status);
                return (
                  <tr key={o.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/whatsapp/orders/${o.id}`} className="text-emerald-700 hover:underline">
                        {o.youcanOrderRef}
                      </Link>
                    </td>
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

      <section className="rounded-2xl border border-red-200 bg-red-50/30 p-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-900">
          Danger zone
        </h2>
        <p className="mb-4 text-xs text-red-900/70">
          Hard-delete this merchant. Cascades to {merchant._count.orders.toLocaleString()}{' '}
          order{merchant._count.orders === 1 ? '' : 's'} and every WhatsApp log row.
          The action is irreversible — prefer toggling the active flag if the merchant
          should just stop receiving traffic.
        </p>
        <DeleteMerchantButton merchantId={merchant.id} />
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
