// =============================================================================
// Configuration-health check for a Merchant row.
//
// Surfaces the gaps that would make an inbound order.create webhook fail to
// produce a successful WhatsApp send. The admin dashboard renders this as
// a badge on the list view and a checklist on the detail page so a
// non-technical operator can see at-a-glance whether a merchant is ready to
// take traffic, without mentally re-deriving the same logic from N fields.
// =============================================================================

import type { Merchant } from '@prisma/client';

export type HealthIssue =
  | 'inactive'
  | 'no-access-token'
  | 'no-whatsapp-sender'
  | 'invalid-whatsapp-sender'
  | 'no-whatsapp-template'
  | 'invalid-whatsapp-template'
  | 'placeholder-email';

const E164 = /^\+\d{8,15}$/;
const TWILIO_CONTENT_SID = /^HX[a-zA-Z0-9]{32}$/;
const PLACEHOLDER_EMAIL = /^pending-\d+@youcan-install\.local$/;

export interface MerchantHealth {
  ok: boolean;
  issues: HealthIssue[];
}

type HealthInput = Pick<
  Merchant,
  | 'email'
  | 'isActive'
  | 'youcanAccessToken'
  | 'whatsappFromNumber'
  | 'whatsappTemplateSid'
>;

export function getMerchantHealth(merchant: HealthInput): MerchantHealth {
  const issues: HealthIssue[] = [];

  if (!merchant.isActive) issues.push('inactive');
  if (!merchant.youcanAccessToken) issues.push('no-access-token');

  if (!merchant.whatsappFromNumber) {
    issues.push('no-whatsapp-sender');
  } else if (!E164.test(merchant.whatsappFromNumber)) {
    issues.push('invalid-whatsapp-sender');
  }

  if (!merchant.whatsappTemplateSid) {
    issues.push('no-whatsapp-template');
  } else if (!TWILIO_CONTENT_SID.test(merchant.whatsappTemplateSid)) {
    issues.push('invalid-whatsapp-template');
  }

  if (PLACEHOLDER_EMAIL.test(merchant.email)) {
    issues.push('placeholder-email');
  }

  return { ok: issues.length === 0, issues };
}

/** Human-readable label for the operator dashboard. */
export function healthIssueLabel(issue: HealthIssue): string {
  switch (issue) {
    case 'inactive':
      return 'Merchant is marked inactive';
    case 'no-access-token':
      return 'No YouCan access token (re-install required)';
    case 'no-whatsapp-sender':
      return 'WhatsApp sender number is not set';
    case 'invalid-whatsapp-sender':
      return 'WhatsApp sender number is not in E.164 format';
    case 'no-whatsapp-template':
      return 'Twilio Content SID is not set';
    case 'invalid-whatsapp-template':
      return 'Twilio Content SID format looks wrong';
    case 'placeholder-email':
      return 'Contact email is still the install-time placeholder';
  }
}
