// =============================================================================
// GET /api/youcan/install
//
// Entry point for the YouCan app install flow. Generates a signed state
// nonce and redirects the merchant to the YouCan-hosted authorise screen.
// On configuration errors, redirects to the friendly /admin/whatsapp/
// install-error page rather than returning raw JSON.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  createOAuthState,
  getYoucanAppConfig,
} from '@/lib/youcan-oauth';
import { logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'youcan_oauth_state';

function errorRedirect(req: NextRequest, reason: string): NextResponse {
  const dest = new URL('/admin/whatsapp/install-error', req.url);
  dest.searchParams.set('reason', reason);
  return NextResponse.redirect(dest, 302);
}

export async function GET(req: NextRequest) {
  const stateSecret = process.env.YOUCAN_STATE_SECRET;
  if (!stateSecret) {
    logError('youcan.install.reject', { reason: 'app-not-configured' });
    return errorRedirect(req, 'app-not-configured');
  }

  let cfg;
  try {
    cfg = getYoucanAppConfig();
  } catch {
    logError('youcan.install.reject', { reason: 'app-not-configured' });
    return errorRedirect(req, 'app-not-configured');
  }

  const { state, cookie } = createOAuthState(stateSecret);
  const url = buildAuthorizeUrl({ state, config: cfg });

  const res = NextResponse.redirect(url, 302);
  res.cookies.set(STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/youcan',
    maxAge: 5 * 60, // 5 minutes — install flow should complete quickly
  });
  return res;
}
