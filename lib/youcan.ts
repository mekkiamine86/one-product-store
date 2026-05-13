import crypto from 'node:crypto';

// =============================================================================
// YouCan platform integration
// -----------------------------------------------------------------------------
// Seller dashboard:  https://seller-area.youcan.shop
// Public API base:   https://api.youcan.shop
// Developer docs:    https://developers.youcan.shop
//
// VERIFY against the current docs before deploying:
//   - exact webhook signature header name (assumed: X-Youcan-Hmac-Sha256)
//   - exact OAuth authorise / token paths
//   - the order PATCH payload shape (status field name, allowed values)
//   - the order-update note field name
// =============================================================================

export const YOUCAN_API_BASE = 'https://api.youcan.shop';
export const YOUCAN_SELLER_BASE = 'https://seller-area.youcan.shop';

/**
 * Verify a YouCan webhook HMAC.
 *
 * YouCan signs the raw request body with the shared webhook secret using
 * HMAC-SHA256 and sends the base64 digest in the webhook signature header.
 *
 * IMPORTANT: pass the *raw* request body — JSON.stringify(JSON.parse(body))
 * will not round-trip byte-for-byte and the signature will fail.
 */
export function verifyYoucanWebhook(
  rawBody: string | Buffer,
  hmacHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) return false;

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- API helpers ------------------------------------------------------------

interface YoucanAuth {
  accessToken: string; // OAuth access token
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
    throw new Error(
      `YouCan API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body}`,
    );
  }
  return res;
}

/** YouCan-native order states our pipeline transitions to. VERIFY the
 *  exact string values against the YouCan order model. */
export type YoucanOrderStatus = 'confirmed' | 'cancelled';

/**
 * Update the order status in YouCan. On COD, "confirmed" tells the
 * fulfilment pipeline the customer is good for the call; "cancelled"
 * removes it.
 *
 * VERIFY: this assumes a PATCH-with-`status` API shape. If YouCan exposes
 * dedicated `/orders/{id}/confirm` and `/orders/{id}/cancel` endpoints,
 * switch to those.
 */
export async function updateOrderStatus(
  auth: YoucanAuth,
  orderId: string | number,
  status: YoucanOrderStatus,
): Promise<void> {
  await youcanFetch(auth, `/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/** Append a private note to the order timeline. VERIFY the field name. */
export async function appendOrderNote(
  auth: YoucanAuth,
  orderId: string | number,
  note: string,
): Promise<void> {
  await youcanFetch(auth, `/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
}
