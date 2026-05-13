// =============================================================================
// POST /api/webhooks/shopify/orders-create
//
// Registered with Shopify as the destination for the `orders/create` topic.
// Workflow:
//   1. Read the *raw* body (HMAC must be computed on bytes Shopify signed).
//   2. Identify the merchant by `X-Shopify-Shop-Domain`.
//   3. Verify the HMAC against the merchant's webhook secret.
//   4. Upsert an Order row (idempotent — Shopify may retry).
//   5. Delegate the WhatsApp send to lib/send-confirmation.
//   6. Always return 2xx so Shopify doesn't retry on application-level errors.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';
import { normalizePhone } from '@/lib/phone';
import { sendOrderConfirmation } from '@/lib/send-confirmation';
import { OrderStatus } from '@prisma/client';

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
  const rawBody = await req.text();

  const shopDomain = req.headers.get('x-shopify-shop-domain');
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic');

  if (!shopDomain || !hmacHeader) {
    return NextResponse.json({ error: 'missing required Shopify headers' }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!merchant || !merchant.isActive) {
    return NextResponse.json({ error: 'unknown shop' }, { status: 401 });
  }

  if (!verifyShopifyWebhook(rawBody, hmacHeader, merchant.shopifyWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

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
      rawShopifyPayload: payload as unknown as object,
    },
  });

  // Send the confirmation. Always 200 to Shopify — the dashboard surfaces
  // failures; we don't want Shopify retries on our application errors.
  const outcome = await sendOrderConfirmation(merchant, order);
  return NextResponse.json(
    { ok: true, topic, orderId: order.id, send: outcome },
    { status: 200 },
  );
}
