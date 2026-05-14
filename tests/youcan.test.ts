import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyYoucanWebhook } from '../lib/youcan';
import {
  buildAuthorizeUrl,
  createOAuthState,
  verifyOAuthState,
} from '../lib/youcan-oauth';

test('verifyYoucanWebhook accepts a valid hex signature', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1, ref: '#1001' });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyYoucanWebhook(body, sig, secret), true);
});

test('verifyYoucanWebhook rejects a base64 signature (wrong encoding)', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1 });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyYoucanWebhook(body, sig, secret), false);
});

test('verifyYoucanWebhook rejects a tampered body', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1 });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyYoucanWebhook(body + ' ', sig, secret), false);
});

test('verifyYoucanWebhook rejects a wrong secret', () => {
  const body = 'hello';
  const sig = crypto.createHmac('sha256', 'a').update(body).digest('hex');
  assert.equal(verifyYoucanWebhook(body, sig, 'b'), false);
});

test('verifyYoucanWebhook rejects a missing header', () => {
  assert.equal(verifyYoucanWebhook('hello', null, 'x'), false);
});

test('buildAuthorizeUrl uses scope[] array syntax with wildcard default', () => {
  const url = buildAuthorizeUrl({
    state: 'abc',
    config: {
      clientId: 'cid',
      clientSecret: 'sec',
      scopes: ['*'],
      appUrl: 'https://app.example.com',
    },
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname,
    'https://seller-area.youcan.shop/admin/oauth/authorize');
  assert.deepEqual(parsed.searchParams.getAll('scope[]'), ['*']);
  assert.equal(parsed.searchParams.get('client_id'), 'cid');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('redirect_uri'),
    'https://app.example.com/api/youcan/callback');
  assert.equal(parsed.searchParams.get('state'), 'abc');
});

test('buildAuthorizeUrl repeats scope[] for multiple explicit scopes', () => {
  const url = buildAuthorizeUrl({
    state: 's',
    config: {
      clientId: 'cid',
      clientSecret: 'sec',
      scopes: ['read_orders', 'write_orders', 'edit-rest-hooks'],
      appUrl: 'https://app.example.com',
    },
  });
  const parsed = new URL(url);
  assert.deepEqual(parsed.searchParams.getAll('scope[]'),
    ['read_orders', 'write_orders', 'edit-rest-hooks']);
});

test('OAuth state round-trips and detects tampering', () => {
  const secret = 'state-secret';
  const { state, cookie } = createOAuthState(secret);
  assert.equal(verifyOAuthState(state, cookie, secret), true);
  assert.equal(verifyOAuthState(state, cookie, 'wrong'), false);
  assert.equal(verifyOAuthState('different', cookie, secret), false);
  assert.equal(verifyOAuthState(state, null, secret), false);
});
