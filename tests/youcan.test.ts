import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyYoucanWebhook } from '../lib/youcan';
import {
  createOAuthState,
  isValidStoreSlug,
  verifyOAuthState,
} from '../lib/youcan-oauth';

test('verifyYoucanWebhook accepts a valid signature', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1, ref: '#1001' });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyYoucanWebhook(body, sig, secret), true);
});

test('verifyYoucanWebhook rejects a tampered body', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1 });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyYoucanWebhook(body + ' ', sig, secret), false);
});

test('verifyYoucanWebhook rejects a wrong secret', () => {
  const body = 'hello';
  const sig = crypto.createHmac('sha256', 'a').update(body).digest('base64');
  assert.equal(verifyYoucanWebhook(body, sig, 'b'), false);
});

test('verifyYoucanWebhook rejects a missing header', () => {
  assert.equal(verifyYoucanWebhook('hello', null, 'x'), false);
});

test('isValidStoreSlug only allows *.youcan.shop hosts', () => {
  assert.equal(isValidStoreSlug('cool-store.youcan.shop'), true);
  assert.equal(isValidStoreSlug('cool-store.youcan.shop.evil.com'), false);
  assert.equal(isValidStoreSlug('cool-store.com'), false);
  assert.equal(isValidStoreSlug(''), false);
  assert.equal(isValidStoreSlug(null), false);
});

test('OAuth state round-trips and detects tampering', () => {
  const secret = 'state-secret';
  const { state, cookie } = createOAuthState(secret);
  assert.equal(verifyOAuthState(state, cookie, secret), true);
  assert.equal(verifyOAuthState(state, cookie, 'wrong'), false);
  assert.equal(verifyOAuthState('different', cookie, secret), false);
  assert.equal(verifyOAuthState(state, null, secret), false);
});
