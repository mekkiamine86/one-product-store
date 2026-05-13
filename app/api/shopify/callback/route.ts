// =============================================================================
// GET /api/shopify/callback
//
// Shopify redirects the merchant here after they accept the OAuth scopes.
// We:
//   1. Verify the state cookie matches the `state` query parameter.
//   2. Verify the `hmac` query parameter (Shopify-signed).
//   3. Exchange `code` for a permanent Admin API access token.
//   4. Upsert the Merchant row.
//   5. Register the `orders/create` and `app/uninstalled` webhooks.
//   6. Redirect the merchant to the in-app settings page.
// =============================================================================

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ensureWebhook,
  exchangeAccessToken,
  getShopifyAppConfig,
  isValidShopDomain,
  verifyOAuthHmac,
  verifyOAuthState,
} from '@/lib/shopify-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'shopify_oauth_state';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (!isValidShopDomain(shop) || !code) {
    return NextResponse.json({ error: 'invalid callback' }, { status: 400 });
  }

  const stateSecret = process.env.SHOPIFY_STATE_SECRET;
  const cfg = (() => {
    try {
      return getShopifyAppConfig();
    } catch {
      return null;
    }
  })();
  if (!stateSecret || !cfg) {
    return NextResponse.json({ error: 'app not configured' }, { status: 500 });
  }

  // 1. State (CSRF) — must match the cookie we set on install.
  const cookieValue = req.cookies.get(STATE_COOKIE)?.value ?? null;
  if (!verifyOAuthState(state, cookieValue, stateSecret)) {
    return NextResponse.json({ error: 'invalid state' }, { status: 401 });
  }

  // 2. Shopify HMAC over the query string.
  if (!verifyOAuthHmac(req.nextUrl.searchParams, cfg.apiSecret)) {
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }

  // 3. Code → access token.
  const { accessToken } = await exchangeAccessToken({ shop, code, config: cfg });

  // 4. Persist merchant. We mint a per-merchant webhook secret on first
  //    install. Shopify *also* offers an app-level signing secret (the
  //    API secret), but per-merchant rotation is cleaner — and we store
  //    the secret we'll sign with on our side anyway.
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const merchant = await prisma.merchant.upsert({
    where: { shopifyDomain: shop },
    create: {
      email: `${shop}@pending.local`,    // backfilled when the merchant
                                          // completes onboarding in-app
      shopifyDomain: shop,
      shopifyAccessToken: accessToken,
      shopifyWebhookSecret: webhookSecret,
      whatsappFromNumber: '',             // configured later in settings
      isActive: true,
    },
    update: {
      shopifyAccessToken: accessToken,
      isActive: true,
    },
  });

  // 5. Register webhooks. Shopify will sign these with our *app secret*,
  //    not the per-merchant secret. To match our verifier, we either
  //    (a) store the app secret as merchant.shopifyWebhookSecret, or
  //    (b) use the EventBridge / pub-sub path with a per-shop key.
  //    For a single-app setup the simplest correct option is (a): use
  //    the app secret as the per-merchant secret.
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { shopifyWebhookSecret: cfg.apiSecret },
  });

  await Promise.all([
    ensureWebhook({
      shop,
      accessToken,
      topic: 'orders/create',
      address: `${cfg.appUrl}/api/webhooks/shopify/orders-create`,
    }),
    ensureWebhook({
      shop,
      accessToken,
      topic: 'app/uninstalled',
      address: `${cfg.appUrl}/api/webhooks/shopify/app-uninstalled`,
    }),
  ]);

  // 6. Drop the state cookie and redirect into the embedded app.
  const dest = new URL(`/admin/dashboard?shop=${encodeURIComponent(shop)}`, cfg.appUrl);
  const res = NextResponse.redirect(dest, 302);
  res.cookies.set(STATE_COOKIE, '', { path: '/api/shopify', maxAge: 0 });
  return res;
}
