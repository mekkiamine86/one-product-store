import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { OrderStatus, Prisma } from '@prisma/client';
import { formatDate, formatMoney, orderStatusBadge, storeSlugLabel } from '../_lib/format';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  status?: string;
  merchant?: string;
  q?: string;
  page?: string;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where: Prisma.OrderWhereInput = {};

  if (searchParams.status && searchParams.status in OrderStatus) {
    where.status = searchParams.status as OrderStatus;
  }
  if (searchParams.merchant) {
    where.merchantId = searchParams.merchant;
  }
  if (searchParams.q) {
    const q = searchParams.q.trim();
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
      { youcanOrderRef: { contains: q, mode: 'insensitive' } },
    ];
  }

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const [orders, total, merchants] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { merchant: { select: { id: true, youcanStoreSlug: true } } },
    }),
    prisma.order.count({ where }),
    prisma.merchant.findMany({
      select: { id: true, youcanStoreSlug: true },
      orderBy: { youcanStoreSlug: 'asc' },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-black/5 bg-white p-4">
        <label className="text-xs">
          <span className="mb-1 block text-black/60">Search</span>
          <input
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="name, phone, order #"
            className="w-56 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-black/60">Status</span>
          <select
            name="status"
            defaultValue={searchParams.status ?? ''}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            <option value="">All</option>
            {Object.values(OrderStatus).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-black/60">Merchant</span>
          <select
            name="merchant"
            defaultValue={searchParams.merchant ?? ''}
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
          >
            <option value="">All merchants</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>{storeSlugLabel(m.youcanStoreSlug)}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-900"
        >
          Apply
        </button>
        <Link href="/admin/whatsapp/orders" className="text-xs text-black/60 hover:text-black">
          Reset
        </Link>
      </form>

      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-black/50">
            <tr>
              <Th>Order</Th>
              <Th>Shop</Th>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th>Sent</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-black/40">
                  No orders match.
                </td>
              </tr>
            )}
            {orders.map((o) => {
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
                  <td className="px-4 py-3 font-mono text-xs">{o.customerPhone}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatMoney(o.totalAmount, o.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>
                      {b.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-black/60">
                    {formatDate(o.confirmationSentAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-black/60">{formatDate(o.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-black/60">
        <div>
          {total.toLocaleString()} order{total === 1 ? '' : 's'} · page {page} of {pageCount}
        </div>
        <div className="flex gap-2">
          <PageLink page={page - 1} disabled={page <= 1} searchParams={searchParams}>← Prev</PageLink>
          <PageLink page={page + 1} disabled={page >= pageCount} searchParams={searchParams}>Next →</PageLink>
        </div>
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  searchParams,
  children,
}: {
  page: number;
  disabled: boolean;
  searchParams: SearchParams;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-full border border-black/10 px-3 py-1 text-xs text-black/30">{children}</span>;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k !== 'page' && v) params.set(k, v);
  }
  params.set('page', String(page));
  return (
    <Link
      href={`/admin/whatsapp/orders?${params.toString()}`}
      className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black hover:text-white"
    >
      {children}
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
