// =============================================================================
// Pure helpers for the WhatsApp inbound webhook.
//
// Kept separate from route.ts so the URL canonicalisation, form-field
// extraction, and intent resolution can be unit-tested without spinning up
// Next, Prisma, or Twilio. The route handler stays focused on orchestration.
// =============================================================================

import { classifyReply, type ReplyIntent } from '@/lib/whatsapp';
import { fromWhatsAppAddress } from '@/lib/phone';
import type { Merchant } from '@prisma/client';

/**
 * The URL Twilio signed when delivering the request.
 *
 * Behind a proxy (Vercel, Cloudflare, ngrok) `req.url` may report a different
 * scheme/host than what Twilio's HMAC covered — typically `http://localhost`
 * or an internal hostname. When PUBLIC_BASE_URL is set, we trust that as the
 * canonical origin and join it with the pathname; otherwise we fall back to
 * `req.url` unchanged.
 */
export function buildTwilioCallbackUrl(reqUrl: string, publicBase: string | undefined): string {
  const trimmed = publicBase?.replace(/\/$/, '') ?? '';
  if (!trimmed) return reqUrl;
  let pathname: string;
  try {
    pathname = new URL(reqUrl).pathname;
  } catch {
    pathname = reqUrl;
  }
  return `${trimmed}${pathname}`;
}

export interface InboundFields {
  /** Customer's number in E.164, or null if From was missing/unparseable. */
  customerE164: string | null;
  /** Merchant's WhatsApp sender in E.164, or null if To was missing. */
  merchantWhatsApp: string | null;
  body: string;
  buttonPayload: string | null;
  messageSid: string | null;
}

/**
 * Pluck the fields we care about out of Twilio's x-www-form-urlencoded body
 * and strip the "whatsapp:" prefix on the addresses. Both sides come in as
 * "whatsapp:+213555000000".
 */
export function extractInboundFields(formParams: Record<string, string>): InboundFields {
  const stripAddr = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const v = fromWhatsAppAddress(raw).trim();
    return v.length > 0 ? v : null;
  };
  return {
    customerE164: stripAddr(formParams['From']),
    merchantWhatsApp: stripAddr(formParams['To']),
    body: formParams['Body'] ?? '',
    buttonPayload: formParams['ButtonPayload'] ?? null,
    messageSid: formParams['MessageSid'] ?? null,
  };
}

/**
 * Resolve the customer's intent.
 *
 * Twilio's quick-reply buttons surface as `ButtonPayload`; when present, we
 * trust the explicit payload over whatever appears in `Body` (which may be
 * the button's display label in the customer's locale and harder to
 * classify reliably).
 */
export function resolveIntent(
  buttonPayload: string | null,
  body: string,
): ReplyIntent {
  return buttonPayload ? classifyReply(buttonPayload) : classifyReply(body);
}

/**
 * Pick the merchant's configured YouCan status slug for a CONFIRM/CANCEL
 * intent. The defaults ("confirmed" / "cancelled") match new-store factory
 * slugs; merchants can override per-row in the admin dashboard.
 */
export function resolveStatusSlug(
  merchant: Pick<Merchant, 'youcanConfirmedSlug' | 'youcanCancelledSlug'>,
  intent: 'CONFIRM' | 'CANCEL',
): string {
  return intent === 'CONFIRM'
    ? merchant.youcanConfirmedSlug
    : merchant.youcanCancelledSlug;
}
