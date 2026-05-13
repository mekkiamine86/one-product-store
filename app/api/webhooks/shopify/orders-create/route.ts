// =============================================================================
// POST /api/webhooks/shopify/orders-create
//
// Registered with Shopify as the destination for the `orders/create` topic.
// Workflow:
//   1. Read the *raw* body (HMAC must be computed on bytes Shopify signed).
//   2. Identify the merchant by `X-Shopify-Shop-Domain`.
//   3. Verify the HMAC against the merchant's webhook secret.
//   4. Upsert an Order row (idempotent — Shopify may retry).
//   5. Send the WhatsApp confirmation message.
//   6. Always return 2xx quickly so Shopify doesn't retry on slow handlers.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';
import {
  sendConfirmationTemplate,
} from '@/lib/whatsapp';
import { normalizePhone, toWhatsAppAddress } from '@/lib/phone';
import { OrderStatus, WhatsAppDirection, WhatsAppMessageStatus } from '@prisma/client';

// Force Node runtime (we use `crypto` + Prisma) and never cache webhook calls.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  name?: string;
  phone?: string;
}

interface ShopifyLineItem {
  title: string;
  quantity: number;
}

interface ShopifyOrderPayload {
  id: number;
  name: string;                           // "#1024"
  email?: string | null;
  phone?: string | null;
  currency: string;
  total_price: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  line_items?: ShopifyLineItem[];
}

export async function POST(req: NextRequest) {
  // 1. Raw body (do NOT JSON.parse before HMAC verification).
  const rawBody = await req.text();

  const shopDomain = req.headers.get('x-shopify-shop-domain');
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic');

  if (!shopDomain || !hmacHeader) {
    return NextResponse.json({ error: 'missing required Shopify headers' }, { status: 400 });
  }

  // 2. Identify the merchant.
  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!merchant || !merchant.isActive) {
    // 401 here is fine — Shopify will treat as failure and retry only the
    // configured number of times. We don't want to silently 200 unknown shops.
    return NextResponse.json({ error: 'unknown shop' }, { status: 401 });
  }

  // 3. Verify HMAC.
  if (!verifyShopifyWebhook(rawBody, hmacHeader, merchant.shopifyWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // 4. Parse & persist.
  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const rawPhone =
    payload.customer?.phone ??
    payload.shipping_address?.phone ??
    payload.billing_address?.phone ??
    payload.phone ??
    null;
  const phoneE164 = normalizePhone(rawPhone, merchant.defaultCountryCode);

  const customerName =
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(' ').trim() ||
    payload.shipping_address?.name ||
    'Customer';

  const lineItemsSummary =
    payload.line_items?.map((li) => `${li.quantity}x ${li.title}`).join(', ').slice(0, 500) ??
    null;

  // Upsert — Shopify will retry the same order on transient failures.
  const order = await prisma.order.upsert({
    where: {
      merchantId_shopifyOrderId: {
        merchantId: merchant.id,
        shopifyOrderId: String(payload.id),
      },
    },
    create: {
      merchantId: merchant.id,
      shopifyOrderId: String(payload.id),
      shopifyOrderName: payload.name,
      customerName,
      customerPhone: phoneE164 ?? '',
      customerEmail: payload.customer?.email ?? payload.email ?? null,
      totalAmount: payload.total_price,
      currency: payload.currency,
      lineItemsSummary,
      status: OrderStatus.PENDING_CONFIRMATION,
      rawShopifyPayload: payload as unknown as object,
    },
    update: {
      // If Shopify resends, keep the row but refresh the snapshot.
      rawShopifyPayload: payload as unknown as object,
    },
  });

  // Acknowledge fast — Shopify's webhook timeout is 5s. We continue async-ish
  // below but await the send so failures are logged before the response.
  // For very high volume, replace this with a queue (BullMQ / SQS / etc.).

  if (!phoneE164) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.FAILED },
    });
    await prisma.whatsAppLog.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        direction: WhatsAppDirection.OUTBOUND,
        fromNumber: merchant.whatsappFromNumber,
        toNumber: rawPhone ?? '',
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: 'Unparseable customer phone number',
      },
    });
    return NextResponse.json({ ok: true, warning: 'invalid phone' }, { status: 200 });
  }

  if (!merchant.whatsappTemplateSid) {
    await prisma.whatsAppLog.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        direction: WhatsAppDirection.OUTBOUND,
        fromNumber: merchant.whatsappFromNumber,
        toNumber: phoneE164,
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: 'Merchant has no whatsappTemplateSid configured',
      },
    });
    return NextResponse.json({ ok: true, warning: 'no template' }, { status: 200 });
  }

  // 5. Send WhatsApp confirmation.
  try {
    const result = await sendConfirmationTemplate({
      fromWhatsApp: toWhatsAppAddress(merchant.whatsappFromNumber),
      toWhatsApp: toWhatsAppAddress(phoneE164),
      contentSid: merchant.whatsappTemplateSid,
      variables: {
        '1': payload.name,                                       // order name
        '2': customerName.split(' ')[0] ?? customerName,         // first name
        '3': `${payload.total_price} ${payload.currency}`,       // total
      },
    });

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { confirmationSentAt: new Date() },
      }),
      prisma.whatsAppLog.create({
        data: {
          merchantId: merchant.id,
          orderId: order.id,
          direction: WhatsAppDirection.OUTBOUND,
          providerMessageId: result.sid,
          fromNumber: merchant.whatsappFromNumber,
          toNumber: phoneE164,
          status: WhatsAppMessageStatus.SENT,
        },
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      }),
      prisma.whatsAppLog.create({
        data: {
          merchantId: merchant.id,
          orderId: order.id,
          direction: WhatsAppDirection.OUTBOUND,
          fromNumber: merchant.whatsappFromNumber,
          toNumber: phoneE164,
          status: WhatsAppMessageStatus.FAILED,
          errorMessage: message.slice(0, 1000),
        },
      }),
    ]);
    // Still 200 — we own the failure and don't want Shopify to retry.
    return NextResponse.json({ ok: true, warning: 'send failed' }, { status: 200 });
  }

  return NextResponse.json({ ok: true, topic, orderId: order.id }, { status: 200 });
}
