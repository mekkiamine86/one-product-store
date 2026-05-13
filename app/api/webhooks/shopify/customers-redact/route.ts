// =============================================================================
// POST /api/webhooks/shopify/customers-redact
//
// Shopify GDPR webhook. Fires 10 days after a customer asks the merchant
// to be forgotten. We must scrub all customer-identifying data we hold,
// but may retain aggregate / order-reference data the merchant still
// needs for accounting.
//
// Strategy:
//   - Find every Order for this customer's phone OR email in the shop.
//   - Replace customer name / phone / email with placeholders.
//   - Null out rawShopifyPayload (contains PII).
//   - Scrub WhatsAppLog body / buttonPayload / rawPayload / fromNumber.
//
// We keep the order *row* itself (id, status, totals) so accounting and
// aggregate metrics still work — Shopify's redaction policy explicitly
// allows this.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CustomerRedactPayload {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email?: string; phone?: string };
  orders_to_redact?: number[];
}

const REDACTED = '[redacted]';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const appSecret = process.env.SHOPIFY_API_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: 'app not configured' }, { status: 500 });
  }
  if (!verifyShopifyWebhook(rawBody, hmacHeader, appSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: CustomerRedactPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: payload.shop_domain },
  });
  if (!merchant) {
    // Nothing to scrub — still 200 so Shopify stops retrying.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const phoneE164 = payload.customer.phone
    ? normalizePhone(payload.customer.phone, merchant.defaultCountryCode)
    : null;

  const orderIdFilters: string[] =
    payload.orders_to_redact?.map((id) => String(id)) ?? [];

  const orders = await prisma.order.findMany({
    where: {
      merchantId: merchant.id,
      OR: [
        ...(phoneE164 ? [{ customerPhone: phoneE164 }] : []),
        ...(payload.customer.email ? [{ customerEmail: payload.customer.email }] : []),
        ...(orderIdFilters.length ? [{ shopifyOrderId: { in: orderIdFilters } }] : []),
      ],
    },
    select: { id: true },
  });

  if (orders.length === 0) {
    return NextResponse.json({ ok: true, redacted: 0 }, { status: 200 });
  }

  const orderIds = orders.map((o) => o.id);

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: {
        customerName: REDACTED,
        customerPhone: REDACTED,
        customerEmail: null,
        // JSON columns are cleared with `Prisma.DbNull`, not the JS `null`.
        rawShopifyPayload: Prisma.DbNull,
      },
    }),
    prisma.whatsAppLog.updateMany({
      where: { orderId: { in: orderIds } },
      data: {
        body: null,
        buttonPayload: null,
        fromNumber: REDACTED,
        toNumber: REDACTED,
        rawPayload: Prisma.DbNull,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, redacted: orderIds.length }, { status: 200 });
}
