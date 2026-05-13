import crypto from 'node:crypto';
import { SHOPIFY_API_VERSION } from './shopify';

// -----------------------------------------------------------------------------
// Shopify OAuth helpers
//
// Two distinct HMAC schemes live on this surface — don't mix them up:
//
//   - Webhook delivery:  HMAC-SHA256 of the raw request body, base64 digest,
//                        carried in the `X-Shopify-Hmac-Sha256` header
//                        (see lib/shopify.ts).
//
//   - OAuth callback:    HMAC-SHA256 of the sorted, decoded query string
//                        (minus `hmac` / `signature`), HEX digest, carried as
//                        the `hmac` query parameter.
// -----------------------------------------------------------------------------

export interface ShopifyAppConfig {
  apiKey: string;        // Shopify Partners → App → Client ID
  apiSecret: string;     // Shopify Partners → App → Client secret
  scopes: string;        // comma-separated, e.g. "read_orders,write_orders"
  appUrl: string;        // public origin of this app, no trailing slash
}

export function getShopifyAppConfig(): ShopifyAppConfig {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const scopes = process.env.SHOPIFY_SCOPES ?? 'read_orders,write_orders';
  const appUrl = process.env.PUBLIC_BASE_URL;
  if (!apiKey || !apiSecret || !appUrl) {
    throw new Error(
      'SHOPIFY_API_KEY, SHOPIFY_API_SECRET and PUBLIC_BASE_URL must be set',
    );
  }
  return { apiKey, apiSecret, scopes, appUrl: appUrl.replace(/\/$/, '') };
}

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Cheap defence-in-depth: reject anything that isn't a *.myshopify.com host. */
export function isValidShopDomain(shop: string | null | undefined): shop is string {
  return !!shop && SHOP_DOMAIN_RE.test(shop);
}

/** Build the Shopify-hosted authorise URL the merchant is redirected to. */
export function buildAuthorizeUrl(opts: {
  shop: string;
  state: string;
  config?: ShopifyAppConfig;
}): string {
  const cfg = opts.config ?? getShopifyAppConfig();
  const params = new URLSearchParams({
    client_id: cfg.apiKey,
    scope: cfg.scopes,
    redirect_uri: `${cfg.appUrl}/api/shopify/callback`,
    state: opts.state,
    'grant_options[]': '',
  });
  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verify the `hmac` query parameter on the OAuth callback.
 *
 * Algorithm (per Shopify docs):
 *   1. Drop `hmac` and `signature`.
 *   2. Sort the remaining keys lexicographically.
 *   3. Build "k=v&k=v&..." from the URL-decoded values (URLSearchParams
 *      already gives us decoded values).
 *   4. HMAC-SHA256 with the app secret, hex digest, constant-time compare.
 */
export function verifyOAuthHmac(
  query: URLSearchParams,
  apiSecret: string,
): boolean {
  const hmac = query.get('hmac');
  if (!hmac) return false;

  const entries: [string, string][] = [];
  query.forEach((v, k) => {
    if (k === 'hmac' || k === 'signature') return;
    entries.push([k, v]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = entries.map(([k, v]) => `${k}=${v}`).join('&');

  const digest = crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('hex');

  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Exchange an authorisation code for a permanent Admin API access token. */
export async function exchangeAccessToken(opts: {
  shop: string;
  code: string;
  config?: ShopifyAppConfig;
}): Promise<{ accessToken: string; scope: string }> {
  const cfg = opts.config ?? getShopifyAppConfig();
  const res = await fetch(`https://${opts.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: cfg.apiKey,
      client_secret: cfg.apiSecret,
      code: opts.code,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OAuth token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: data.access_token, scope: data.scope };
}

/**
 * Idempotently register a webhook with Shopify. Shopify returns 422 if a
 * webhook for the same topic + address already exists — we treat that as
 * success.
 */
export async function ensureWebhook(opts: {
  shop: string;
  accessToken: string;
  topic: string;          // e.g. "orders/create"
  address: string;        // e.g. "https://app.example.com/api/webhooks/shopify/orders-create"
}): Promise<void> {
  const res = await fetch(
    `https://${opts.shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': opts.accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        webhook: { topic: opts.topic, address: opts.address, format: 'json' },
      }),
    },
  );
  if (res.ok || res.status === 422) return;
  const body = await res.text().catch(() => '');
  throw new Error(
    `Webhook registration failed for ${opts.topic}: ${res.status} ${body}`,
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
