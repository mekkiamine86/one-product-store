import crypto from 'node:crypto';

// =============================================================================
// YouCan platform integration
// -----------------------------------------------------------------------------
// Seller dashboard:  https://seller-area.youcan.shop
// Public API base:   https://api.youcan.shop
// Developer docs:    https://developer.youcan.shop   (note: singular "developer")
//
// Everything here is sourced from the docs (REST Hooks listing & subscribe,
// orders/update_status, orders/close, OAuth introduction).
// =============================================================================

export const YOUCAN_API_BASE = 'https://api.youcan.shop';
export const YOUCAN_SELLER_BASE = 'https://seller-area.youcan.shop';

/** Header carrying the per-event signature on incoming REST Hook deliveries. */
export const YOUCAN_SIGNATURE_HEADER = 'x-youcan-signature';

/**
 * Verify a YouCan REST Hook signature.
 *
 * Per docs/store-admin/resthooks/listing:
 *   - algorithm:    HMAC-SHA256
 *   - signing key:  the app's OAuth client secret (app-level, not per webhook)
 *   - message:      the JSON-encoded payload
 *   - digest:       hex (PHP `hash_hmac(..., $raw_output = false)` default)
 *   - header:       x-youcan-signature
 *
 * IMPORTANT: pass the *raw* request body. YouCan signs the bytes their server
 * emitted; re-encoding (JSON.stringify(JSON.parse(body))) won't match because
 * PHP's json_encode escapes `/` as `\/` and Node's JSON.stringify doesn't.
 */
export function verifyYoucanWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  clientSecret: string,
): boolean {
  if (!signatureHeader || !clientSecret) return false;

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- API helpers ------------------------------------------------------------

export interface YoucanAuth {
  accessToken: string;
}

/**
 * Typed error so callers (specifically the auto-refresh wrapper) can
 * distinguish a 401 from other failures without parsing strings.
 */
export class YoucanApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, message: string, body = '') {
    super(message);
    this.name = 'YoucanApiError';
    this.status = status;
    this.body = body;
  }
}

// --- Retry policy ----------------------------------------------------------

/**
 * Status codes worth retrying. We retry on 429 (rate limit) and the standard
 * transient 5xx codes. 4xx-client (other than 429) and 401 are non-retryable:
 *   - 401 → auto-refresh wrapper handles it
 *   - 400/403/404/409/422 → bug or merchant state, retries make it worse
 *   - 500 → ambiguous; YouCan emits 500s for both transient and persistent
 *           errors, retrying once is a fair compromise
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const DEFAULT_MAX_ATTEMPTS = 4;       // initial + 3 retries
const DEFAULT_BASE_DELAY_MS = 250;    // exponential base
const DEFAULT_MAX_DELAY_MS = 1_000;   // cap per backoff step

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Parse the Retry-After header. Spec allows either a delta-seconds integer
 * or an HTTP-date; we accept either and cap at maxDelayMs.
 */
function retryAfterMs(header: string | null | undefined, maxDelayMs: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxDelayMs);
  }
  const ts = Date.parse(header);
  if (!Number.isNaN(ts)) {
    return Math.max(0, Math.min(ts - Date.now(), maxDelayMs));
  }
  return null;
}

function backoffMs(attempt: number, baseMs: number, maxMs: number): number {
  // Full jitter (AWS-style): random in [0, min(max, base * 2^attempt))
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable for tests so we don't actually sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable for tests so the network is mockable cleanly. */
  fetchImpl?: typeof fetch;
}

/**
 * fetch() with retry on 429/5xx + network errors, exponential backoff with
 * full jitter, Retry-After respected. Throws YoucanApiError for non-retryable
 * non-2xx responses, and after exhausting retries on retryable ones.
 *
 * Total worst-case wait: ~baseDelay * (2^0 + 2^1 + 2^2) bounded by maxDelay
 * per step. With the defaults (250ms base, 1000ms cap, 4 attempts) the
 * absolute upper bound is ~3s — within the webhook handler's response
 * budget on Vercel's default serverless timeout.
 */
export async function youcanFetchWithRetry(
  input: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const doSleep = opts.sleepImpl ?? sleep;
  const doFetch = opts.fetchImpl ?? fetch;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response | null = null;
    let networkErr: unknown = null;
    try {
      res = await doFetch(input, init);
    } catch (err) {
      networkErr = err;
    }

    const isLastAttempt = attempt === maxAttempts - 1;

    if (networkErr !== null) {
      if (isLastAttempt) throw networkErr;
    } else if (res!.ok || !RETRYABLE_STATUSES.has(res!.status)) {
      return res!;
    } else if (isLastAttempt) {
      return res!;
    }

    const delay =
      res?.status === 429
        ? retryAfterMs(res.headers.get('retry-after'), maxDelay) ??
          backoffMs(attempt, baseDelay, maxDelay)
        : backoffMs(attempt, baseDelay, maxDelay);
    await doSleep(delay);
  }
  // Unreachable — the loop returns or throws on the last attempt.
  throw new Error('youcanFetchWithRetry: exhausted retries without resolution');
}

async function youcanFetch(
  auth: YoucanAuth,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${YOUCAN_API_BASE}${path}`;
  const res = await youcanFetchWithRetry(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new YoucanApiError(
      res.status,
      `YouCan API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body}`,
      body,
    );
  }
  return res;
}

/**
 * Update an order's status using the configurable per-store statuses.
 *
 * Endpoint (docs/store-admin/orders/update_status):
 *   PUT https://api.youcan.shop/orders/{id}/status/{context}
 *   body: { status: "<slug>" }
 *
 * `context` selects which status axis to touch — "orders" (the general status,
 * what we use for confirm/cancel on a COD pipeline), "shipping_status", or
 * "payment_status".
 *
 * `slug` comes from the store's custom-statuses list. Newly-provisioned
 * stores typically ship with "confirmed" and "cancelled" slugs, but merchants
 * can rename them, so treat the values as opaque strings and let operators
 * override per-merchant if needed.
 */
export async function updateOrderStatus(
  auth: YoucanAuth,
  orderId: string | number,
  slug: string,
  context: 'orders' | 'shipping_status' | 'payment_status' = 'orders',
): Promise<void> {
  await youcanFetch(auth, `/orders/${orderId}/status/${context}`, {
    method: 'PUT',
    body: JSON.stringify({ status: slug }),
  });
}

/**
 * Close an order. Distinct from cancelling: closing finalises an order in any
 * terminal state (delivered, refunded, cancelled) so it stops appearing in
 * the seller's active queue.
 *
 * Endpoint (docs/store-admin/orders/close):
 *   PUT https://api.youcan.shop/orders/{id}/close
 */
export async function closeOrder(
  auth: YoucanAuth,
  orderId: string | number,
): Promise<void> {
  await youcanFetch(auth, `/orders/${orderId}/close`, { method: 'PUT' });
}
