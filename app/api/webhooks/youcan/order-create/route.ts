// =============================================================================
// POST /api/webhooks/youcan/order-create?m=<merchantId>
//
// Registered with YouCan's REST Hooks as the destination for `order.create`.
// Workflow:
//   1. Read the *raw* body — the signature is HMAC of the bytes YouCan sent.
//   2. Identify the merchant via the `m` query param (encoded in target_url
//      at install time). YouCan's payload doesn't document a routing key.
//   3. Verify x-youcan-signature against the merchant's webhook secret
//      (which is the app-level OAuth client secret).
//   4. Upsert an Order row (idempotent — YouCan retries on 4xx/5xx, up to
//      3 times with ~1s delay between attempts).
//   5. Fire the WhatsApp confirmation.
//   6. Always return 2xx so we don't get retried on application-level errors.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyYoucanWebhook, YOUCAN_SIGNATURE_HEADER } from '@/lib/youcan';
import { normalizePhone } from '@/lib/phone';
import { sendOrderConfirmation } from '@/lib/send-confirmation';
import { OrderStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The exact field names below match the order.create payload as summarised
// in the resthooks docs (order id, ref, total, currency, status, payment
// status, customer, variants, payment info, shipping info). Field names are
// best-effort against what we've been able to read; tweak as the docs evolve.
interface YoucanCustomer {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
}

interface YoucanVariant {
  quantity: number;
  product?: { name?: string };
  product_name?: string;
}

interface YoucanOrderPayload {
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
  // YouCan's payload schema isn't fully documented; we accept any of these
  // shapes for the store id and ignore them all gracefully if absent.
  store_id?: string | number;
  store?: { id?: string | number; slug?: string };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signatureHeader = req.headers.get(YOUCAN_SIGNATURE_HEADER);
  if (!signatureHeader) {
    return NextResponse.json(
      { error: 'missing signature header' },
      { status: 400 },
    );
  }

  const merchantId = req.nextUrl.searchParams.get('m');
  if (!merchantId) {
    return NextResponse.json(
      { error: 'missing merchant identifier' },
      { status: 400 },
    );
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant || !merchant.isActive) {
    return NextResponse.json({ error: 'unknown merchant' }, { status: 401 });
  }

  if (!verifyYoucanWebhook(rawBody, signatureHeader, merchant.youcanWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: YoucanOrderPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const rawPhone =
    payload.customer?.phone ??
    payload.shipping?.phone ??
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
    payload.variants
      ?.map((v) => `${v.quantity}x ${v.product?.name ?? v.product_name ?? 'item'}`)
      .join(', ')
      .slice(0, 500) ?? null;

  // Opportunistically capture the platform store id the first time we see one.
  const payloadStoreId =
    payload.store_id !== undefined ? String(payload.store_id) :
    payload.store?.id !== undefined ? String(payload.store.id) : null;
  if (payloadStoreId && merchant.youcanStoreId !== payloadStoreId) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { youcanStoreId: payloadStoreId },
    });
  }

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
  return NextResponse.json(
    { ok: true, orderId: order.id, send: outcome },
    { status: 200 },
  );
}
