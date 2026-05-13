// =============================================================================
// GET /api/youcan/install
//
// Entry point for the YouCan app install flow. Generates a signed state
// nonce and redirects the merchant to the YouCan-hosted authorise screen.
// The store identity is discovered after the OAuth handshake via
// fetchAuthenticatedStore().
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  createOAuthState,
  getYoucanAppConfig,
} from '@/lib/youcan-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'youcan_oauth_state';

export async function GET(_req: NextRequest) {
  const stateSecret = process.env.YOUCAN_STATE_SECRET;
  if (!stateSecret) {
    return NextResponse.json(
      { error: 'YOUCAN_STATE_SECRET not configured' },
      { status: 500 },
    );
  }

  const cfg = (() => {
    try {
      return getYoucanAppConfig();
    } catch (err) {
      return err instanceof Error ? err.message : 'unconfigured';
    }
  })();
  if (typeof cfg === 'string') {
    return NextResponse.json({ error: cfg }, { status: 500 });
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
