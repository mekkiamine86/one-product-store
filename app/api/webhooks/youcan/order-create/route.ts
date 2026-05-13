// =============================================================================
// POST /api/webhooks/youcan/order-create
//
// Registered with YouCan as the destination for the `order.create` event.
// Workflow:
//   1. Read the *raw* body (HMAC is computed on the bytes YouCan signed).
//   2. Identify the merchant by the store slug in the payload.
//   3. Verify the HMAC against the merchant's webhook secret.
//   4. Upsert an Order row (idempotent — YouCan may retry).
//   5. Delegate the WhatsApp send to lib/send-confirmation.
//   6. Always return 2xx so YouCan doesn't retry on application-level errors.
//
// VERIFY against developers.youcan.shop:
//   - signature header name (assumed `X-Youcan-Hmac-Sha256`)
//   - store identification (header vs. payload field; we read both)
//   - payload field names (id / ref / customer / line items / totals)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyYoucanWebhook } from '@/lib/youcan';
import { normalizePhone } from '@/lib/phone';
import { sendOrderConfirmation } from '@/lib/send-confirmation';
import { OrderStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface YoucanCustomer {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
}

interface YoucanLineItem {
  title?: string;
  product_name?: string;
  quantity: number;
}

interface YoucanOrderPayload {
  id: number | string;
  ref?: string;                         // human-readable, e.g. "#1024"
  order_number?: string | number;
  currency: string;
  total?: number | string;
  total_price?: number | string;
  customer?: YoucanCustomer | null;
  shipping_phone?: string | null;
  store?: { slug?: string; domain?: string };
  line_items?: YoucanLineItem[];
}

const HMAC_HEADER = 'x-youcan-hmac-sha256';    // VERIFY
const SLUG_HEADER = 'x-youcan-store';          // VERIFY (fallback to payload)

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const hmacHeader = req.headers.get(HMAC_HEADER);
  if (!hmacHeader) {
    return NextResponse.json({ error: 'missing signature header' }, { status: 400 });
  }

  // Identify the merchant. Prefer a header if YouCan sends one; fall back
  // to a `store` block in the payload.
  let payload: YoucanOrderPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const storeSlug =
    req.headers.get(SLUG_HEADER) ??
    payload.store?.slug ??
    payload.store?.domain ??
    null;
  if (!storeSlug) {
    return NextResponse.json({ error: 'cannot identify store' }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { youcanStoreSlug: storeSlug },
  });
  if (!merchant || !merchant.isActive) {
    return NextResponse.json({ error: 'unknown store' }, { status: 401 });
  }

  if (!verifyYoucanWebhook(rawBody, hmacHeader, merchant.youcanWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // Extract the bits we care about.
  const rawPhone =
    payload.customer?.phone ??
    payload.shipping_phone ??
    null;
  const phoneE164 = normalizePhone(rawPhone, merchant.defaultCountryCode);

  const customerName =
    payload.customer?.full_name?.trim() ||
    [payload.customer?.first_name, payload.customer?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'Customer';

  const orderRef =
    payload.ref ??
    (payload.order_number !== undefined ? `#${payload.order_number}` : String(payload.id));

  const total = payload.total ?? payload.total_price ?? '0';
  const lineItemsSummary =
    payload.line_items
      ?.map((li) => `${li.quantity}x ${li.title ?? li.product_name ?? 'item'}`)
      .join(', ')
      .slice(0, 500) ?? null;

  const order = await prisma.order.upsert({
    where: {
      merchantId_youcanOrderId: {
        merchantId: merchant.id,
        youcanOrderId: String(payload.id),
      },
    },
    create: {
      merchantId: merchant.id,
      youcanOrderId: String(payload.id),
      youcanOrderRef: orderRef,
      customerName,
      customerPhone: phoneE164 ?? '',
      customerEmail: payload.customer?.email ?? null,
      totalAmount: String(total),
      currency: payload.currency,
      lineItemsSummary,
      status: OrderStatus.PENDING_CONFIRMATION,
      rawYoucanPayload: payload as unknown as object,
    },
    update: {
      rawYoucanPayload: payload as unknown as object,
    },
  });

  const outcome = await sendOrderConfirmation(merchant, order);
  return NextResponse.json({ ok: true, orderId: order.id, send: outcome }, { status: 200 });
}
