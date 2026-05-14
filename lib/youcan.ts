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

async function youcanFetch(
  auth: YoucanAuth,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${YOUCAN_API_BASE}${path}`;
  const res = await fetch(url, {
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
