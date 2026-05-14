// =============================================================================
// Pure data-shaping helpers for the YouCan order.create webhook payload.
// Kept separate from route.ts so the extraction logic is unit-testable
// without spinning up Next, Prisma, or a real HTTP request.
//
// Field names are best-effort against the resthooks docs' English prose
// summary of the order payload. The interface tolerates both flat
// (`shipping_phone`, `total`) and nested (`shipping.phone`, `total_price`,
// `store.id`) shapes so new payload variants don't crash the handler.
// =============================================================================

import { normalizePhone } from '@/lib/phone';

export interface YoucanCustomer {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
}

export interface YoucanVariant {
  quantity: number;
  product?: { name?: string };
  product_name?: string;
}

export interface YoucanOrderPayload {
  id: number | string;
  ref?: string;
  order_number?: string | number;
  currency: string;
  total?: number | string;
  total_price?: number | string;
  customer?: YoucanCustomer | null;
  shipping_phone?: string | null;
  shipping?: { phone?: string | null };
  variants?: YoucanVariant[];
  store_id?: string | number;
  store?: { id?: string | number; slug?: string };
}

export interface ExtractedOrderFields {
  customerName: string;
  customerPhone: string | null;
  orderRef: string;
  total: string;
  lineItemsSummary: string | null;
  storeId: string | null;
}

export function extractCustomerName(payload: YoucanOrderPayload): string {
  return (
    payload.customer?.full_name?.trim() ||
    [payload.customer?.first_name, payload.customer?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Customer'
  );
}

export function extractRawPhone(payload: YoucanOrderPayload): string | null {
  return (
    payload.customer?.phone ??
    payload.shipping?.phone ??
    payload.shipping_phone ??
    null
  );
}

export function extractOrderRef(payload: YoucanOrderPayload): string {
  return (
    payload.ref ??
    (payload.order_number !== undefined
      ? `#${payload.order_number}`
      : String(payload.id))
  );
}

export function extractTotal(payload: YoucanOrderPayload): string {
  return String(payload.total ?? payload.total_price ?? '0');
}

export function extractLineItemsSummary(
  payload: YoucanOrderPayload,
): string | null {
  if (!payload.variants?.length) return null;
  return (
    payload.variants
      .map((v) => `${v.quantity}x ${v.product?.name ?? v.product_name ?? 'item'}`)
      .join(', ')
      .slice(0, 500)
  );
}

export function extractStoreId(payload: YoucanOrderPayload): string | null {
  if (payload.store_id !== undefined) return String(payload.store_id);
  if (payload.store?.id !== undefined) return String(payload.store.id);
  return null;
}

export function extractOrderFields(
  payload: YoucanOrderPayload,
  defaultCountryCode: string,
): ExtractedOrderFields {
  return {
    customerName: extractCustomerName(payload),
    customerPhone: normalizePhone(extractRawPhone(payload), defaultCountryCode),
    orderRef: extractOrderRef(payload),
    total: extractTotal(payload),
    lineItemsSummary: extractLineItemsSummary(payload),
    storeId: extractStoreId(payload),
  };
}
