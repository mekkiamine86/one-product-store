// =============================================================================
// Phone-number normalisation for COD markets.
//
// Handles the three forms a Shopify checkout typically produces:
//   1. Already-E.164:               "+213555000000"
//   2. International "00" prefix:   "00213555000000"
//   3. Local-form national number:  "0555000000" (uses merchant's default
//                                    country to look up the dial code and
//                                    strip the leading national prefix "0")
//
// The dial-code table covers the markets where COD is most common. Extend
// freely — there's no metadata bundle to worry about.
// =============================================================================

const DIAL_CODES: Readonly<Record<string, string>> = {
  // North Africa / Middle East
  DZ: '213', MA: '212', TN: '216', EG: '20', LY: '218', MR: '222',
  SA: '966', AE: '971', QA: '974', KW: '965', BH: '973', OM: '968',
  JO: '962', LB: '961', IQ: '964', SY: '963', PS: '970', YE: '967',
  // Wider region
  TR: '90', IR: '98', AF: '93',
  // South / South-East Asia
  PK: '92', IN: '91', BD: '880', LK: '94',
  ID: '62', MY: '60', PH: '63', VN: '84', TH: '66',
  // Sub-Saharan Africa
  NG: '234', KE: '254', ZA: '27', GH: '233', SN: '221', CI: '225',
  ET: '251', TZ: '255', UG: '256', CM: '237',
  // North America / Europe (for completeness)
  US: '1', CA: '1', GB: '44', FR: '33', ES: '34', DE: '49', IT: '39',
};

const E164_MIN = 8;   // shortest reasonable subscriber number
const E164_MAX = 15;  // ITU-T E.164 cap

/**
 * Normalise a raw phone string to E.164 (e.g. "+213555000000").
 * Returns null if the input can't be confidently mapped.
 *
 * `defaultCountry` is the ISO-3166-1 alpha-2 code used only when the input
 * has no international prefix.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: string,
): string | null {
  if (!input) return null;

  const cleaned = input.replace(/[^\d+]/g, '');
  if (!cleaned) return null;

  let digits: string;
  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    digits = cleaned.slice(2);
  } else {
    const dial = DIAL_CODES[defaultCountry.toUpperCase()];
    if (!dial) return null;
    // National prefix in all COD-market countries we ship is a single
    // leading "0"; strip it before prepending the country dial code.
    const trimmed = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
    digits = dial + trimmed;
  }

  if (!/^\d+$/.test(digits)) return null;
  if (digits.length < E164_MIN || digits.length > E164_MAX) return null;
  return `+${digits}`;
}

/** Format an E.164 number for Twilio's WhatsApp channel: "whatsapp:+1234567890". */
export function toWhatsAppAddress(e164: string): string {
  return e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`;
}

/** Strip Twilio's "whatsapp:" prefix to recover the raw E.164 number. */
export function fromWhatsAppAddress(addr: string): string {
  return addr.replace(/^whatsapp:/, '');
}
