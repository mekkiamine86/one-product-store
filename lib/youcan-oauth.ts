import crypto from 'node:crypto';
import { YOUCAN_API_BASE, YOUCAN_SELLER_BASE } from './youcan';

// -----------------------------------------------------------------------------
// YouCan OAuth helpers
// -----------------------------------------------------------------------------
// Two distinct HMAC schemes live on this surface — don't mix them up:
//
//   - Webhook delivery:  HMAC-SHA256 of the raw request body, base64 digest,
//                        carried in the webhook signature header
//                        (see lib/youcan.ts).
//
//   - OAuth state:       a random nonce we sign ourselves to harden the
//                        callback against CSRF — not a platform-provided
//                        signature. The standard `state` round-trip is
//                        sufficient on YouCan's callback (which does not
//                        carry its own query-string HMAC).
//
// VERIFY before deploying — exact authorise / token endpoints and any
// extra signature parameters on the callback. See:
// https://developers.youcan.shop
// -----------------------------------------------------------------------------

export interface YoucanAppConfig {
  clientId: string;     // YouCan Developer Portal → App → Client ID
  clientSecret: string; // YouCan Developer Portal → App → Client Secret
  scopes: string;       // space- or comma-separated, per YouCan docs
  appUrl: string;       // public origin of this app, no trailing slash
}

export function getYoucanAppConfig(): YoucanAppConfig {
  const clientId = process.env.YOUCAN_CLIENT_ID;
  const clientSecret = process.env.YOUCAN_CLIENT_SECRET;
  const scopes = process.env.YOUCAN_SCOPES ?? 'read_orders write_orders';
  const appUrl = process.env.PUBLIC_BASE_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      'YOUCAN_CLIENT_ID, YOUCAN_CLIENT_SECRET and PUBLIC_BASE_URL must be set',
    );
  }
  return { clientId, clientSecret, scopes, appUrl: appUrl.replace(/\/$/, '') };
}

const STORE_SLUG_RE = /^[a-z0-9][a-z0-9-]*\.youcan\.shop$/i;

/** Cheap defence-in-depth: reject anything that isn't a *.youcan.shop host. */
export function isValidStoreSlug(slug: string | null | undefined): slug is string {
  return !!slug && STORE_SLUG_RE.test(slug);
}

/** Build the YouCan-hosted authorise URL the merchant is redirected to. */
export function buildAuthorizeUrl(opts: {
  state: string;
  config?: YoucanAppConfig;
}): string {
  const cfg = opts.config ?? getYoucanAppConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    scope: cfg.scopes,
    redirect_uri: `${cfg.appUrl}/api/youcan/callback`,
    state: opts.state,
  });
  // VERIFY: authorise path on the seller dashboard.
  return `${YOUCAN_SELLER_BASE}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an authorisation code for an access token.
 * VERIFY: token endpoint URL and whether YouCan expects form-encoded or
 * JSON body. The shape below assumes form-encoded (RFC 6749 default).
 */
export async function exchangeAccessToken(opts: {
  code: string;
  config?: YoucanAppConfig;
}): Promise<{ accessToken: string; refreshToken: string | null; scope: string | null }> {
  const cfg = opts.config ?? getYoucanAppConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: opts.code,
    redirect_uri: `${cfg.appUrl}/api/youcan/callback`,
  });
  const res = await fetch(`${YOUCAN_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope ?? null,
  };
}

/**
 * Identify the authenticated store after the OAuth handshake.
 *
 * VERIFY: YouCan likely exposes a "current store" or "me" endpoint that
 * returns the store slug + id for the access token we just minted.
 */
export async function fetchAuthenticatedStore(accessToken: string): Promise<{
  slug: string;
  id?: string | number;
}> {
  const res = await fetch(`${YOUCAN_API_BASE}/me/store`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to load YouCan store: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { slug?: string; domain?: string; id?: string | number };
  // VERIFY: response field that carries the *.youcan.shop slug.
  const slug = data.slug ?? data.domain;
  if (!slug || !isValidStoreSlug(slug)) {
    throw new Error('YouCan /me/store response did not include a valid store slug');
  }
  return { slug, id: data.id };
}

/**
 * Idempotently register a webhook with YouCan. We treat any 2xx and any
 * 409/422 (already exists) as success so re-installs don't blow up.
 *
 * VERIFY: webhook registration endpoint, payload shape (topic / event
 * field name), and the expected idempotency response code.
 */
export async function ensureWebhook(opts: {
  accessToken: string;
  event: string;         // e.g. "order.create"
  url: string;
}): Promise<void> {
  const res = await fetch(`${YOUCAN_API_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ event: opts.event, url: opts.url }),
  });
  if (res.ok || res.status === 409 || res.status === 422) return;
  const text = await res.text().catch(() => '');
  throw new Error(
    `Webhook registration failed for ${opts.event}: ${res.status} ${text}`,
  );
}

/**
 * Generate a random nonce for the OAuth `state` parameter and a matching
 * signed value to put in a cookie. We sign so the callback can verify the
 * state actually originated from the install endpoint without keeping
 * server-side session state.
 */
export function createOAuthState(secret: string): { state: string; cookie: string } {
  const state = crypto.randomBytes(24).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(state).digest('base64url');
  return { state, cookie: `${state}.${sig}` };
}

export function verifyOAuthState(
  stateFromQuery: string | null,
  cookieValue: string | null,
  secret: string,
): boolean {
  if (!stateFromQuery || !cookieValue) return false;
  const [state, sig] = cookieValue.split('.');
  if (!state || !sig || state !== stateFromQuery) return false;
  const expected = crypto.createHmac('sha256', secret).update(state).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
