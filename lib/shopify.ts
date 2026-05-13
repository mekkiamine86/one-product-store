import crypto from 'node:crypto';

// Pin the API version. Bump it deliberately, not implicitly.
export const SHOPIFY_API_VERSION = '2024-10';

/**
 * Verify a Shopify webhook HMAC.
 *
 * Shopify signs the raw request body with the app's shared secret using
 * HMAC-SHA256 and sends the base64 digest in `X-Shopify-Hmac-Sha256`.
 *
 * IMPORTANT: pass the *raw* request body — JSON.stringify(JSON.parse(body))
 * will not round-trip byte-for-byte and the signature will fail.
 */
export function verifyShopifyWebhook(
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

// --- Admin API helpers ------------------------------------------------------

interface ShopifyAuth {
  shopDomain: string;       // e.g. "my-store.myshopify.com"
  accessToken: string;      // Admin API access token
}

function shopifyUrl(shopDomain: string, path: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
}

async function shopifyFetch(
  auth: ShopifyAuth,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(shopifyUrl(auth.shopDomain, path), {
    ...init,
    headers: {
      'X-Shopify-Access-Token': auth.accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Shopify API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${body}`,
    );
  }
  return res;
}

/**
 * Replace the order's tag list. Shopify treats `tags` as a single comma-
 * separated string, so we read the current tags, merge, and PUT them back.
 */
export async function addOrderTags(
  auth: ShopifyAuth,
  orderId: string | number,
  newTags: string[],
): Promise<void> {
  const getRes = await shopifyFetch(auth, `/orders/${orderId}.json?fields=id,tags`);
  const { order } = (await getRes.json()) as { order: { id: number; tags: string } };

  const existing = (order.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const merged = Array.from(new Set([...existing, ...newTags]));

  await shopifyFetch(auth, `/orders/${orderId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ order: { id: order.id, tags: merged.join(', ') } }),
  });
}

/**
 * Cancel a Shopify order. For COD orders there's nothing to refund, but we
 * still pass `email: false` so Shopify doesn't notify the customer twice
 * (we already messaged them on WhatsApp).
 */
export async function cancelShopifyOrder(
  auth: ShopifyAuth,
  orderId: string | number,
  reason: 'customer' | 'declined' | 'fraud' | 'inventory' | 'other' = 'customer',
): Promise<void> {
  await shopifyFetch(auth, `/orders/${orderId}/cancel.json`, {
    method: 'POST',
    body: JSON.stringify({ reason, email: false }),
  });
}

/** Append a private note to the order timeline. */
export async function appendOrderNote(
  auth: ShopifyAuth,
  orderId: string | number,
  note: string,
): Promise<void> {
  await shopifyFetch(auth, `/orders/${orderId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ order: { id: Number(orderId), note } }),
  });
}
