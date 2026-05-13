// =============================================================================
// POST /api/webhooks/shopify/customers-data-request
//
// Shopify GDPR webhook. A customer has requested the data we hold about
// them. Per Shopify's compliance docs we have 30 days to forward the data
// to the merchant — we acknowledge the webhook immediately and emit a
// stdout audit line so an external job / human can fulfil it.
//
// The webhook is *always* signed with the app secret, regardless of
// merchant. We verify against SHOPIFY_API_SECRET directly because the
// webhook may arrive for a shop we've never installed on (Shopify still
// fires GDPR webhooks for stores that had your app installed previously).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyShopifyWebhook } from '@/lib/shopify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DataRequestPayload {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email?: string; phone?: string };
  orders_requested?: number[];
  data_request: { id: number };
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

  let payload: DataRequestPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  // Forward to the merchant operator out-of-band. Replace with email / queue
  // / ticket system as appropriate for your ops process.
  console.log(
    '[gdpr][data_request]',
    JSON.stringify({
      shop: payload.shop_domain,
      customerId: payload.customer.id,
      ordersRequested: payload.orders_requested ?? [],
      requestId: payload.data_request.id,
    }),
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
