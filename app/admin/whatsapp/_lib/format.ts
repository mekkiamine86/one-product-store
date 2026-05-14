import { OrderStatus, WhatsAppMessageStatus } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export function formatMoney(amount: Decimal | number | string, currency: string): string {
  const n = typeof amount === 'object' ? Number(amount.toString()) : Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function orderStatusBadge(status: OrderStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case OrderStatus.PENDING_CONFIRMATION:
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case OrderStatus.CONFIRMED:
      return { label: 'Confirmed', className: 'bg-emerald-100 text-emerald-800' };
    case OrderStatus.CANCELLED:
      return { label: 'Cancelled', className: 'bg-rose-100 text-rose-800' };
    case OrderStatus.EXPIRED:
      return { label: 'Expired', className: 'bg-neutral-200 text-neutral-700' };
    case OrderStatus.FAILED:
      return { label: 'Failed', className: 'bg-red-100 text-red-800' };
  }
}

export function waStatusLabel(status: WhatsAppMessageStatus | undefined | null): string {
  if (!status) return '—';
  return status.toLowerCase().replace(/_/g, ' ');
}

/** Render a YouCan store slug or its placeholder when the operator hasn't
 *  set one yet (YouCan exposes no /me endpoint to populate it at install). */
export function storeSlugLabel(slug: string | null | undefined): string {
  return slug?.trim() || '(unset store)';
}
