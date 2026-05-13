import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { classifyReply, validateTwilioSignature } from '../lib/whatsapp';
import { normalizePhone, toWhatsAppAddress, fromWhatsAppAddress } from '../lib/phone';

test('classifyReply recognises CONFIRM in EN/AR/FR', () => {
  assert.equal(classifyReply('Confirm'), 'CONFIRM');
  assert.equal(classifyReply('yes please'), 'CONFIRM');
  assert.equal(classifyReply('نعم'), 'CONFIRM');
  assert.equal(classifyReply('تأكيد'), 'CONFIRM');
  assert.equal(classifyReply('Oui'), 'CONFIRM');
});

test('classifyReply recognises CANCEL in EN/AR/FR', () => {
  assert.equal(classifyReply('Cancel'), 'CANCEL');
  assert.equal(classifyReply('NO'), 'CANCEL');
  assert.equal(classifyReply('لا'), 'CANCEL');
  assert.equal(classifyReply('إلغاء'), 'CANCEL');
  assert.equal(classifyReply('Annuler la commande'), 'CANCEL');
});

test('classifyReply returns UNKNOWN for ambiguous input', () => {
  assert.equal(classifyReply(''), 'UNKNOWN');
  assert.equal(classifyReply(null), 'UNKNOWN');
  assert.equal(classifyReply('what?'), 'UNKNOWN');
  assert.equal(classifyReply('hi there'), 'UNKNOWN');
});

test('validateTwilioSignature accepts a valid signature', () => {
  const authToken = 'twilio-token';
  const url = 'https://app.example.com/api/webhooks/whatsapp';
  const params = {
    From: 'whatsapp:+213555000000',
    To: 'whatsapp:+14155238886',
    Body: 'Confirm',
    MessageSid: 'SM' + 'a'.repeat(32),
  };
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k as keyof typeof params], url);
  const sig = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');

  assert.equal(validateTwilioSignature(url, params, sig, authToken), true);
});

test('validateTwilioSignature rejects a tampered body', () => {
  const authToken = 'twilio-token';
  const url = 'https://app.example.com/api/webhooks/whatsapp';
  const params = { From: 'a', Body: 'Confirm' };
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k as keyof typeof params], url);
  const sig = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');

  const tampered = { ...params, Body: 'Cancel' };
  assert.equal(validateTwilioSignature(url, tampered, sig, authToken), false);
});

test('validateTwilioSignature rejects missing signature', () => {
  assert.equal(validateTwilioSignature('https://x', {}, null, 'token'), false);
});

test('normalizePhone parses local Algerian numbers with default country', () => {
  // Common forms a Shopify COD checkout might send
  assert.equal(normalizePhone('0555000000', 'DZ'), '+213555000000');
  assert.equal(normalizePhone('+213 555 00 00 00', 'DZ'), '+213555000000');
});

test('normalizePhone returns null for garbage', () => {
  assert.equal(normalizePhone('not-a-number', 'DZ'), null);
  assert.equal(normalizePhone('', 'DZ'), null);
  assert.equal(normalizePhone(null, 'DZ'), null);
});

test('WhatsApp address round-trip', () => {
  assert.equal(toWhatsAppAddress('+14155238886'), 'whatsapp:+14155238886');
  assert.equal(toWhatsAppAddress('whatsapp:+14155238886'), 'whatsapp:+14155238886');
  assert.equal(fromWhatsAppAddress('whatsapp:+14155238886'), '+14155238886');
});
