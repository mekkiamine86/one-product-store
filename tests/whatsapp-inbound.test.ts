import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTwilioCallbackUrl,
  extractInboundFields,
  resolveIntent,
  resolveStatusSlug,
} from '../app/api/webhooks/whatsapp/inbound';

// --- buildTwilioCallbackUrl ------------------------------------------------

test('buildTwilioCallbackUrl prefers PUBLIC_BASE_URL when set', () => {
  assert.equal(
    buildTwilioCallbackUrl(
      'http://localhost:3000/api/webhooks/whatsapp',
      'https://app.example.com',
    ),
    'https://app.example.com/api/webhooks/whatsapp',
  );
});

test('buildTwilioCallbackUrl strips trailing slashes on the base', () => {
  assert.equal(
    buildTwilioCallbackUrl(
      'http://internal-host/api/webhooks/whatsapp',
      'https://app.example.com/',
    ),
    'https://app.example.com/api/webhooks/whatsapp',
  );
});

test('buildTwilioCallbackUrl falls back to req.url when no public base', () => {
  assert.equal(
    buildTwilioCallbackUrl(
      'https://app.example.com/api/webhooks/whatsapp',
      undefined,
    ),
    'https://app.example.com/api/webhooks/whatsapp',
  );
  assert.equal(
    buildTwilioCallbackUrl(
      'https://app.example.com/api/webhooks/whatsapp',
      '',
    ),
    'https://app.example.com/api/webhooks/whatsapp',
  );
});

test('buildTwilioCallbackUrl preserves the path including query stripping', () => {
  // The signed URL must reproduce the public path; query strings are not
  // part of the path component but Twilio signs them separately. Here we
  // only care that the pathname carries through verbatim.
  assert.equal(
    buildTwilioCallbackUrl(
      'http://localhost:3000/api/webhooks/whatsapp?foo=bar',
      'https://app.example.com',
    ),
    'https://app.example.com/api/webhooks/whatsapp',
  );
});

// --- extractInboundFields --------------------------------------------------

test('extractInboundFields strips the "whatsapp:" prefix on both sides', () => {
  const out = extractInboundFields({
    From: 'whatsapp:+212600111222',
    To: 'whatsapp:+14155238886',
    Body: 'OK',
    MessageSid: 'SM123',
  });
  assert.equal(out.customerE164, '+212600111222');
  assert.equal(out.merchantWhatsApp, '+14155238886');
  assert.equal(out.body, 'OK');
  assert.equal(out.messageSid, 'SM123');
  assert.equal(out.buttonPayload, null);
});

test('extractInboundFields returns null for missing addresses', () => {
  const out = extractInboundFields({});
  assert.equal(out.customerE164, null);
  assert.equal(out.merchantWhatsApp, null);
  assert.equal(out.body, '');
  assert.equal(out.buttonPayload, null);
  assert.equal(out.messageSid, null);
});

test('extractInboundFields returns null for blank addresses', () => {
  const out = extractInboundFields({ From: '   ', To: 'whatsapp:' });
  assert.equal(out.customerE164, null);
  assert.equal(out.merchantWhatsApp, null);
});

test('extractInboundFields surfaces button payload when present', () => {
  const out = extractInboundFields({
    From: 'whatsapp:+212600111222',
    To: 'whatsapp:+14155238886',
    Body: 'Confirm',
    ButtonPayload: 'CONFIRM_COD',
  });
  assert.equal(out.buttonPayload, 'CONFIRM_COD');
});

// --- resolveIntent ---------------------------------------------------------

test('resolveIntent prefers the button payload when both are present', () => {
  // Button payload says CONFIRM, body says "annuler" (cancel). Button wins.
  const intent = resolveIntent('CONFIRM_COD', 'annuler');
  assert.equal(intent, 'CONFIRM');
});

test('resolveIntent falls back to free-text classification', () => {
  assert.equal(resolveIntent(null, 'oui je confirme'), 'CONFIRM');
  assert.equal(resolveIntent(null, 'cancel please'), 'CANCEL');
});

test('resolveIntent returns UNKNOWN for unrecognised text', () => {
  assert.equal(resolveIntent(null, 'hello'), 'UNKNOWN');
});

test('resolveIntent uses the button payload even if it itself is gibberish', () => {
  // Button payloads not in the CONFIRM/CANCEL vocabulary fall through to
  // UNKNOWN — we don't quietly switch to body parsing, since the merchant
  // configured a template with specific quick-reply payloads and an
  // unexpected payload value suggests a template misconfiguration.
  assert.equal(resolveIntent('SOMETHING_ELSE', 'oui'), 'UNKNOWN');
});

// --- resolveStatusSlug -----------------------------------------------------

test('resolveStatusSlug picks per-merchant slugs', () => {
  const merchant = {
    youcanConfirmedSlug: 'confirmee',
    youcanCancelledSlug: 'refusee',
  };
  assert.equal(resolveStatusSlug(merchant, 'CONFIRM'), 'confirmee');
  assert.equal(resolveStatusSlug(merchant, 'CANCEL'), 'refusee');
});
