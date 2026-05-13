// =============================================================================
// POST /api/webhooks/shopify/app-uninstalled
//
// Shopify fires this when a merchant uninstalls the app. We:
//   - verify the HMAC,
//   - mark the merchant inactive (so the orders/create handler will
//     start rejecting their traffic),
//   - zero out the now-invalid access token.
//
// The Order / WhatsAppLog history is kept for support + analytics.
// GDPR-mandated topics (customers/data_request, customers/redact,
// shop/redact) should be handled by their own routes — they have
// different SLAs and payloads.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook } from '@/lib/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const shopDomain = req.headers.get('x-shopify-shop-domain');
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');

  if (!shopDomain || !hmacHeader) {
    return NextResponse.json({ error: 'missing headers' }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { shopifyDomain: shopDomain },
  });
  if (!merchant) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!verifyShopifyWebhook(rawBody, hmacHeader, merchant.shopifyWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      isActive: false,
      shopifyAccessToken: '',  // token is revoked by Shopify on uninstall
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
