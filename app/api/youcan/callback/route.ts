// =============================================================================
// GET /api/youcan/callback
//
// YouCan redirects the merchant here after they accept the OAuth scopes.
//   1. Verify the state cookie matches the `state` query parameter (CSRF).
//   2. Exchange `code` for an access token (and refresh token).
//   3. Upsert a Merchant row. YouCan exposes no documented "/me" endpoint,
//      so we generate the merchant id ourselves and let the operator fill in
//      a display slug later from the dashboard. Webhook routing is
//      URL-based (the merchant id rides in the registered target_url's
//      query string).
//   4. Subscribe to the `order.create` and `app.uninstalled` REST Hooks.
//   5. Redirect into the dashboard.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ensureWebhook,
  exchangeAccessToken,
  getYoucanAppConfig,
  verifyOAuthState,
} from '@/lib/youcan-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'youcan_oauth_state';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'missing code' }, { status: 400 });
  }

  const stateSecret = process.env.YOUCAN_STATE_SECRET;
  const cfg = (() => {
    try {
      return getYoucanAppConfig();
    } catch {
      return null;
    }
  })();
  if (!stateSecret || !cfg) {
    return NextResponse.json({ error: 'app not configured' }, { status: 500 });
  }

  const cookieValue = req.cookies.get(STATE_COOKIE)?.value ?? null;
  if (!verifyOAuthState(state, cookieValue, stateSecret)) {
    return NextResponse.json({ error: 'invalid state' }, { status: 401 });
  }

  const { accessToken, refreshToken } = await exchangeAccessToken({
    code,
    config: cfg,
  });

  // The REST Hook signing key is the app-level client secret (per docs);
  // we copy it onto the merchant for symmetry with the rest of the codebase
  // and so secret rotation can be staged per-merchant if it ever becomes a
  // YouCan feature.
  const merchant = await prisma.merchant.create({
    data: {
      email: `pending-${Date.now()}@youcan-install.local`,
      // youcanStoreSlug / youcanStoreId stay NULL until either the operator
      // sets a display label from the dashboard or the first order.create
      // webhook arrives with a platform store id we can capture.
      youcanAccessToken: accessToken,
      youcanRefreshToken: refreshToken,
      youcanWebhookSecret: cfg.clientSecret,
      whatsappFromNumber: '',
      isActive: true,
    },
  });

  // Webhook routing: encode the merchant id in the target_url query string.
  // The webhook handler reads `m` to identify which merchant the event
  // belongs to, since YouCan's payload-level store id is not documented.
  const target = (path: string) =>
    `${cfg.appUrl}${path}?m=${encodeURIComponent(merchant.id)}`;

  await Promise.all([
    ensureWebhook({
      accessToken,
      event: 'order.create',
      targetUrl: target('/api/webhooks/youcan/order-create'),
    }),
    ensureWebhook({
      accessToken,
      event: 'app.uninstalled',
      targetUrl: target('/api/webhooks/youcan/app-uninstalled'),
    }),
  ]);

  const dest = new URL(`/admin/whatsapp/merchants/${merchant.id}`, cfg.appUrl);
  const res = NextResponse.redirect(dest, 302);
  res.cookies.set(STATE_COOKIE, '', { path: '/api/youcan', maxAge: 0 });
  return res;
}
