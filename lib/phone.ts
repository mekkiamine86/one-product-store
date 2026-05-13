import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

/**
 * Normalise a phone number to E.164 (e.g. "+14155551212").
 * Returns null if the number can't be parsed as a valid mobile/fixed line.
 *
 * `defaultCountry` is the ISO-3166-1 alpha-2 code (e.g. "DZ", "MA", "EG")
 * used when the input has no country prefix.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: string,
): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}

/** Format an E.164 number for Twilio's WhatsApp channel: "whatsapp:+1234567890". */
export function toWhatsAppAddress(e164: string): string {
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
}

/** Strip Twilio's "whatsapp:" prefix to recover the raw E.164 number. */
export function fromWhatsAppAddress(addr: string): string {
  return addr.replace(/^whatsapp:/, '');
}
