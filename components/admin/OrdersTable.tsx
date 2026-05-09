'use client';

import { useEffect, useState } from 'react';
import type { Order } from '@/lib/supabase';

const STATUS_LABELS: Record<Order['status'], string> = {
  pending: 'بانتظار التأكيد',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغى',
};

const STATUS_STYLES: Record<Order['status'], string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-200',
  shipped: 'bg-purple-50 text-purple-800 border-purple-200',
  delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export default function OrdersTable() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<Order['status'] | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التحميل');
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: Order['status']) => {
    setOrders((prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)) ?? prev);

    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        await load();
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'فشل التحديث');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    }
  };

  const filtered = (orders ?? []).filter((o) => filter === 'all' || o.status === filter);

  const counts = {
    all: orders?.length ?? 0,
    pending: orders?.filter((o) => o.status === 'pending').length ?? 0,
    confirmed: orders?.filter((o) => o.status === 'confirmed').length ?? 0,
    shipped: orders?.filter((o) => o.status === 'shipped').length ?? 0,
    delivered: orders?.filter((o) => o.status === 'delivered').length ?? 0,
    cancelled: orders?.filter((o) => o.status === 'cancelled').length ?? 0,
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black md:text-2xl">الطلبات</h2>
          <p className="mt-1 text-sm text-black/60">
            {orders ? `${counts.all} طلب إجمالاً` : 'جارٍ التحميل...'}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black/80 transition-colors hover:bg-black hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          تحديث
        </button>
      </div>

      {/* Filter chips */}
      <div className="mb-6 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
          الكل
        </Chip>
        {(Object.keys(STATUS_LABELS) as Order['status'][]).map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} count={counts[s]}>
            {STATUS_LABELS[s]}
          </Chip>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {orders === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-black/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-neutral-50 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5">
            <svg className="h-6 w-6 text-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-black/60">لا توجد طلبات</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((order) => (
              <OrderCard key={order.id} order={order} onStatusChange={updateStatus} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-black/10 md:block">
            <table className="w-full text-right">
              <thead className="bg-neutral-50">
                <tr>
                  <Th>العميل</Th>
                  <Th>الهاتف</Th>
                  <Th>العنوان</Th>
                  <Th>السعر</Th>
                  <Th>التاريخ</Th>
                  <Th>الحالة</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((order) => (
                  <tr key={order.id} className="text-sm">
                    <Td>
                      <div className="font-semibold text-black">{order.customer_name}</div>
                      <div className="text-xs text-black/50">{order.product_name}</div>
                    </Td>
                    <Td>
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="text-black/80 transition-colors hover:text-black"
                        dir="ltr"
                      >
                        {order.customer_phone}
                      </a>
                    </Td>
                    <Td>
                      <div className="max-w-xs truncate text-black/70">
                        {order.customer_address}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-black">
                        {order.product_price.toLocaleString('ar-DZ')} دج
                      </div>
                    </Td>
                    <Td>
                      <div className="text-xs text-black/60">
                        {formatDate(order.created_at)}
                      </div>
                    </Td>
                    <Td>
                      <StatusSelect
                        value={order.status}
                        onChange={(s) => updateStatus(order.id, s)}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  count,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-black text-white'
          : 'border border-black/15 bg-white text-black/70 hover:bg-black/5'
      }`}
    >
      <span>{children}</span>
      <span className={`text-xs ${active ? 'text-white/70' : 'text-black/40'}`}>{count}</span>
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-black/60">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
}

function OrderCard({
  order,
  onStatusChange,
}: {
  order: Order;
  onStatusChange: (id: string, s: Order['status']) => void;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-black">{order.customer_name}</div>
          <a
            href={`tel:${order.customer_phone}`}
            className="mt-0.5 block text-sm text-black/70"
            dir="ltr"
          >
            {order.customer_phone}
          </a>
        </div>
        <div className="text-left">
          <div className="font-bold text-black">
            {order.product_price.toLocaleString('ar-DZ')} دج
          </div>
          <div className="mt-0.5 text-xs text-black/50">{formatDate(order.created_at)}</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-black/70">
        {order.customer_address}
      </div>

      <div className="mt-3">
        <StatusSelect value={order.status} onChange={(s) => onStatusChange(order.id, s)} />
      </div>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: Order['status'];
  onChange: (v: Order['status']) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Order['status'])}
      className={`w-full cursor-pointer appearance-none rounded-full border px-3 py-1.5 text-xs font-medium outline-none transition-colors md:w-auto ${STATUS_STYLES[value]}`}
    >
      {(Object.keys(STATUS_LABELS) as Order['status'][]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) {
    return d.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' });
}
