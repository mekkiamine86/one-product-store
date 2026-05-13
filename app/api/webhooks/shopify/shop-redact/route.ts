// =============================================================================
// POST /api/webhooks/shopify/shop-redact
//
// Shopify GDPR webhook. Fires 48 hours after the merchant uninstalls the
// app. We must delete all data we hold for the shop.
//
// We do a hard delete of the Merchant row — Order and WhatsAppLog rows
// cascade away via the schema's `onDelete: Cascade`.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ShopRedactPayload {
  shop_id: number;
  shop_domain: string;
}

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

  let payload: ShopRedactPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // deleteMany so the request is idempotent — Shopify may resend.
  const result = await prisma.merchant.deleteMany({
    where: { shopifyDomain: payload.shop_domain },
  });

  return NextResponse.json({ ok: true, deleted: result.count }, { status: 200 });
}
