import crypto from 'node:crypto';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

// --- Client -----------------------------------------------------------------

let _client: Twilio | null = null;

/** Lazily-initialised, process-wide Twilio client. */
export function getTwilioClient(): Twilio {
  if (_client) return _client;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
  }
  _client = twilio(sid, token);
  return _client;
}

// --- Sending ----------------------------------------------------------------

export interface SendConfirmationParams {
  fromWhatsApp: string;          // "whatsapp:+14155238886"
  toWhatsApp: string;            // "whatsapp:+213XXXXXXXXX"
  contentSid: string;            // Twilio Content SID for the approved template
  /**
   * Variables substituted into the template. The keys MUST match the
   * `{{1}}`, `{{2}}`, … placeholders of the template body and button payloads.
   * Recommended schema:
   *   { "1": orderName, "2": customerFirstName, "3": orderTotal }
   */
  variables: Record<string, string>;
  statusCallback?: string;       // optional delivery-status webhook URL
}

/**
 * Send the COD confirmation template (with "Confirm" / "Cancel" quick-reply
 * buttons) via Twilio's Content API. Returns the Twilio Message SID.
 */
export async function sendConfirmationTemplate(
  params: SendConfirmationParams,
): Promise<{ sid: string; status: string }> {
  const client = getTwilioClient();
  const msg = await client.messages.create({
    from: params.fromWhatsApp,
    to: params.toWhatsApp,
    contentSid: params.contentSid,
    contentVariables: JSON.stringify(params.variables),
    ...(params.statusCallback ? { statusCallback: params.statusCallback } : {}),
  });
  return { sid: msg.sid, status: msg.status };
}

// --- Inbound webhook helpers ------------------------------------------------

/**
 * Validate a Twilio webhook signature.
 *
 * Twilio signs: full URL (incl. query string) + concatenation of POST params
 * sorted alphabetically by key, then HMAC-SHA1 with the auth token, base64.
 *
 * Note: if the request reaches your server behind a proxy that rewrites the
 * scheme/host, build `fullUrl` from the *original* public URL Twilio called.
 */
export function validateTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signature: string | null | undefined,
  authToken: string,
): boolean {
  if (!signature || !authToken) return false;

  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], fullUrl);

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type ReplyIntent = 'CONFIRM' | 'CANCEL' | 'UNKNOWN';

// Localised keyword tables — extend per market.
const CONFIRM_KEYWORDS = [
  'confirm', 'yes', 'ok', 'okay',
  'نعم', 'تأكيد', 'موافق', 'اوكي',     // Arabic
  'oui', 'confirmer',                    // French (FR/MA/DZ)
];
const CANCEL_KEYWORDS = [
  'cancel', 'no', 'stop',
  'لا', 'الغاء', 'إلغاء',                // Arabic
  'non', 'annuler',                      // French
];

/**
 * Classify a customer's WhatsApp reply. Works for both quick-reply button
 * payloads (where Body is the button title) and free-text replies.
 */
export function classifyReply(body: string | null | undefined): ReplyIntent {
  if (!body) return 'UNKNOWN';
  const normalised = body.trim().toLowerCase();
  if (CONFIRM_KEYWORDS.some((k) => normalised === k || normalised.startsWith(k))) {
    return 'CONFIRM';
  }
  if (CANCEL_KEYWORDS.some((k) => normalised === k || normalised.startsWith(k))) {
    return 'CANCEL';
  }
  return 'UNKNOWN';
}
