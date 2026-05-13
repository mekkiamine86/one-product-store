// =============================================================================
// GET /api/youcan/callback
//
// YouCan redirects the merchant here after they accept the OAuth scopes.
// We:
//   1. Verify the state cookie matches the `state` query parameter (CSRF).
//   2. Exchange `code` for an access token (and refresh token).
//   3. Resolve the authenticated store slug via the YouCan API.
//   4. Upsert the Merchant row.
//   5. Register the `order.create` and `app.uninstalled` webhooks.
//   6. Redirect the merchant to the in-app dashboard.
// =============================================================================

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ensureWebhook,
  exchangeAccessToken,
  fetchAuthenticatedStore,
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

  // 1. State (CSRF) — must match the cookie we set on install.
  const cookieValue = req.cookies.get(STATE_COOKIE)?.value ?? null;
  if (!verifyOAuthState(state, cookieValue, stateSecret)) {
    return NextResponse.json({ error: 'invalid state' }, { status: 401 });
  }

  // 2. Code → access token.
  const { accessToken, refreshToken } = await exchangeAccessToken({
    code,
    config: cfg,
  });

  // 3. Resolve the authenticated store.
  const store = await fetchAuthenticatedStore(accessToken);

  // 4. Persist merchant. We mint a per-merchant webhook signing secret on
  //    first install. YouCan will sign the webhooks it sends us using
  //    *this* secret (passed during webhook registration / configured in
  //    the developer portal).
  //
  //    VERIFY: whether YouCan accepts a per-webhook signing secret on
  //    registration, or signs with an app-level secret. If app-level,
  //    set `youcanWebhookSecret = cfg.clientSecret` on every install.
  const webhookSecret = crypto.randomBytes(32).toString('hex');

  const merchant = await prisma.merchant.upsert({
    where: { youcanStoreSlug: store.slug },
    create: {
      email: `${store.slug}@pending.local`, // backfilled by merchant in-app
      youcanStoreSlug: store.slug,
      youcanAccessToken: accessToken,
      youcanRefreshToken: refreshToken,
      youcanWebhookSecret: webhookSecret,
      whatsappFromNumber: '',
      isActive: true,
    },
    update: {
      youcanAccessToken: accessToken,
      youcanRefreshToken: refreshToken,
      isActive: true,
    },
  });

  // 5. Register webhooks. Idempotent — re-installs won't blow up.
  await Promise.all([
    ensureWebhook({
      accessToken,
      event: 'order.create',                  // VERIFY topic name
      url: `${cfg.appUrl}/api/webhooks/youcan/order-create`,
    }),
    ensureWebhook({
      accessToken,
      event: 'app.uninstalled',               // VERIFY topic name
      url: `${cfg.appUrl}/api/webhooks/youcan/app-uninstalled`,
    }),
  ]);

  // 6. Drop the state cookie and redirect into the dashboard.
  const dest = new URL(
    `/admin/whatsapp/merchants/${merchant.id}`,
    cfg.appUrl,
  );
  const res = NextResponse.redirect(dest, 302);
  res.cookies.set(STATE_COOKIE, '', { path: '/api/youcan', maxAge: 0 });
  return res;
}
