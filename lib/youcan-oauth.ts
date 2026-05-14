import crypto from 'node:crypto';
import {
  YOUCAN_API_BASE,
  YOUCAN_SELLER_BASE,
  YoucanApiError,
  youcanFetchWithRetry,
  type YoucanAuth,
} from './youcan';
import { log } from './log';

// -----------------------------------------------------------------------------
// YouCan OAuth helpers
// -----------------------------------------------------------------------------
// Docs:
//   https://developer.youcan.shop/store-admin/introduction/oauth
//   https://developer.youcan.shop/store-admin/resthooks/subscribe
//
// HMAC schemes on this surface — don't mix them up:
//
//   - Webhook signature:  HMAC-SHA256 of the raw request body, hex digest,
//                         signed with the app's OAuth client secret, carried
//                         in the `x-youcan-signature` header. See lib/youcan.ts.
//
//   - OAuth state nonce:  a random value we sign ourselves to harden the
//                         callback against CSRF — YouCan's callback does NOT
//                         carry a platform-provided signature, so the standard
//                         `state` round-trip is the only CSRF defence.
// -----------------------------------------------------------------------------

export interface YoucanAppConfig {
  clientId: string;     // Partners → Apps → Your App → Client ID
  clientSecret: string; // Partners → Apps → Your App → Client Secret
  scopes: string[];     // ["*"] for all; otherwise the explicit list
  appUrl: string;       // public origin of this app, no trailing slash
}

export function getYoucanAppConfig(): YoucanAppConfig {
  const clientId = process.env.YOUCAN_CLIENT_ID;
  const clientSecret = process.env.YOUCAN_CLIENT_SECRET;
  const appUrl = process.env.PUBLIC_BASE_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      'YOUCAN_CLIENT_ID, YOUCAN_CLIENT_SECRET and PUBLIC_BASE_URL must be set',
    );
  }
  const scopes = (process.env.YOUCAN_SCOPES ?? '*')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { clientId, clientSecret, scopes, appUrl: appUrl.replace(/\/$/, '') };
}

/**
 * Build the YouCan-hosted authorise URL the merchant is redirected to.
 *
 * Per docs: scopes are passed as repeated `scope[]=` query params, and `*` is
 * a wildcard that grants every scope the app has been approved for.
 *
 *   https://seller-area.youcan.shop/admin/oauth/authorize
 *     ?client_id=<id>
 *     &response_type=code
 *     &redirect_uri=<cb>
 *     &state=<nonce>
 *     &scope[]=*                  (or repeated: &scope[]=read_orders&scope[]=...)
 */
export function buildAuthorizeUrl(opts: {
  state: string;
  config?: YoucanAppConfig;
}): string {
  const cfg = opts.config ?? getYoucanAppConfig();
  const params = new URLSearchParams();
  params.set('client_id', cfg.clientId);
  params.set('response_type', 'code');
  params.set('redirect_uri', `${cfg.appUrl}/api/youcan/callback`);
  params.set('state', opts.state);
  for (const s of cfg.scopes) params.append('scope[]', s);
  return `${YOUCAN_SELLER_BASE}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an authorisation code for an access token. Standard OAuth 2.0
 * `authorization_code` grant; form-encoded POST.
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
  const res = await youcanFetchWithRetry(`${YOUCAN_API_BASE}/oauth/token`, {
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
 * Mint a fresh access token from a refresh token.
 *
 * Standard OAuth 2.0 `refresh_token` grant. YouCan's docs cover the
 * authorization-code half of /oauth/token in detail; the refresh half is
 * not separately documented, so the body shape below follows RFC 6749 §6.
 * If the wire format turns out to differ, this is the single function to
 * adjust.
 */
export async function refreshAccessToken(opts: {
  refreshToken: string;
  config?: YoucanAppConfig;
}): Promise<{ accessToken: string; refreshToken: string | null; scope: string | null }> {
  const cfg = opts.config ?? getYoucanAppConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: opts.refreshToken,
  });
  const res = await youcanFetchWithRetry(`${YOUCAN_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth token refresh failed: ${res.status} ${text}`);
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
 * Run a YouCan API call with automatic access-token refresh on a single 401.
 *
 * Behaviour:
 *   - First attempt uses the merchant's current access token.
 *   - If it throws YoucanApiError with status 401 and we have a refresh
 *     token, swap tokens, persist via `persistTokens`, and retry once.
 *   - Any other error (or a second 401) propagates.
 *
 * `persistTokens` is injected rather than calling Prisma directly so this
 * helper has no DB dependency and tests can run against an in-memory state.
 * The route handler supplies the prisma.merchant.update call.
 *
 * Token rotation: most OAuth providers issue a new refresh_token on every
 * refresh; some do not. We keep the previous refresh_token if the response
 * omits one, so a non-rotating server doesn't strand the merchant.
 */
export async function withAutoRefresh<T>(
  args: {
    merchant: { youcanAccessToken: string; youcanRefreshToken: string | null };
    persistTokens: (t: {
      accessToken: string;
      refreshToken: string | null;
    }) => Promise<void>;
    /**
     * Caller-supplied fields merged into the refresh-attempt log lines.
     * Typically `{ requestId, merchantId }` so the lines correlate with
     * the inbound request that triggered them.
     */
    logContext?: Record<string, string>;
    refresh?: typeof refreshAccessToken;
  },
  call: (auth: YoucanAuth) => Promise<T>,
): Promise<T> {
  const refresh = args.refresh ?? refreshAccessToken;
  const ctx = args.logContext ?? {};
  try {
    return await call({ accessToken: args.merchant.youcanAccessToken });
  } catch (err) {
    if (!(err instanceof YoucanApiError) || err.status !== 401) throw err;
    if (!args.merchant.youcanRefreshToken) throw err;

    log('youcan.token.refresh_attempt', ctx);
    const refreshed = await refresh({
      refreshToken: args.merchant.youcanRefreshToken,
    });
    const nextRefreshToken = refreshed.refreshToken ?? args.merchant.youcanRefreshToken;
    await args.persistTokens({
      accessToken: refreshed.accessToken,
      refreshToken: nextRefreshToken,
    });
    log('youcan.token.refreshed', { ...ctx, rotated: !!refreshed.refreshToken });
    return call({ accessToken: refreshed.accessToken });
  }
}

/**
 * Subscribe to a REST Hook event idempotently. Re-installs won't blow up.
 *
 * Per docs/store-admin/resthooks/subscribe:
 *   POST https://api.youcan.shop/resthooks/subscribe
 *   body: { event: "order.create", target_url: "https://..." }
 *   requires the `edit-rest-hooks` permission.
 *
 * Available events (non-exhaustive): order.create, order.update,
 * app.uninstalled. The full list lives on the resthooks/listing page.
 *
 * Target URL must be publicly reachable — localhost/private network URLs are
 * rejected.
 */
export async function ensureWebhook(opts: {
  accessToken: string;
  event: string;
  targetUrl: string;
}): Promise<void> {
  const res = await youcanFetchWithRetry(`${YOUCAN_API_BASE}/resthooks/subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ event: opts.event, target_url: opts.targetUrl }),
  });
  // 2xx → fresh subscription. 409/422 → already subscribed; treat as success.
  if (res.ok || res.status === 409 || res.status === 422) return;
  const text = await res.text().catch(() => '');
  throw new Error(
    `REST Hook subscribe failed for ${opts.event}: ${res.status} ${text}`,
  );
}

// --- OAuth `state` cookie helpers ------------------------------------------

/**
 * Mint a random nonce for the OAuth `state` parameter and a matching signed
 * value to drop into a cookie. The callback verifies the cookie HMAC and
 * compares the nonce to the `state` query param — defends against CSRF
 * without server-side session state.
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
