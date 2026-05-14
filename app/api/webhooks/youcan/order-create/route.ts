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
import { sendOrderConfirmation } from '@/lib/send-confirmation';
import { OrderStatus } from '@prisma/client';
import { extractOrderFields, type YoucanOrderPayload } from './extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const fields = extractOrderFields(payload, merchant.defaultCountryCode);

  // Opportunistically capture the platform store id the first time we see one.
  if (fields.storeId && merchant.youcanStoreId !== fields.storeId) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { youcanStoreId: fields.storeId },
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
      youcanOrderRef: fields.orderRef,
      customerName: fields.customerName,
      customerPhone: fields.customerPhone ?? '',
      customerEmail: payload.customer?.email ?? null,
      totalAmount: fields.total,
      currency: payload.currency,
      lineItemsSummary: fields.lineItemsSummary,
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
