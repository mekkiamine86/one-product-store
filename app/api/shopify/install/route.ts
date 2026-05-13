// =============================================================================
// GET /api/shopify/install?shop=my-store.myshopify.com
//
// Entry point for the Shopify App Store install flow. Validates the shop
// domain, generates a signed state nonce, and redirects to Shopify's
// authorise screen.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  createOAuthState,
  getShopifyAppConfig,
  isValidShopDomain,
} from '@/lib/shopify-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'shopify_oauth_state';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: 'invalid or missing `shop` parameter' },
      { status: 400 },
    );
  }

  const stateSecret = process.env.SHOPIFY_STATE_SECRET;
  if (!stateSecret) {
    return NextResponse.json(
      { error: 'SHOPIFY_STATE_SECRET not configured' },
      { status: 500 },
    );
  }

  const { state, cookie } = createOAuthState(stateSecret);
  const url = buildAuthorizeUrl({ shop, state, config: getShopifyAppConfig() });

  const res = NextResponse.redirect(url, 302);
  res.cookies.set(STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/shopify',
    maxAge: 5 * 60, // 5 minutes — install flow should complete quickly
  });
  return res;
}
