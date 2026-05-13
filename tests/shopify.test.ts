import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyShopifyWebhook } from '../lib/shopify';
import {
  createOAuthState,
  isValidShopDomain,
  verifyOAuthHmac,
  verifyOAuthState,
} from '../lib/shopify-oauth';

test('verifyShopifyWebhook accepts a valid signature', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1, name: '#1001' });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyShopifyWebhook(body, sig, secret), true);
});

test('verifyShopifyWebhook rejects a tampered body', () => {
  const secret = 'super-secret';
  const body = JSON.stringify({ id: 1 });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(verifyShopifyWebhook(body + ' ', sig, secret), false);
});

test('verifyShopifyWebhook rejects a wrong secret', () => {
  const body = 'hello';
  const sig = crypto.createHmac('sha256', 'a').update(body).digest('base64');
  assert.equal(verifyShopifyWebhook(body, sig, 'b'), false);
});

test('verifyShopifyWebhook rejects a missing header', () => {
  assert.equal(verifyShopifyWebhook('hello', null, 'x'), false);
});

test('isValidShopDomain only allows *.myshopify.com hosts', () => {
  assert.equal(isValidShopDomain('cool-store.myshopify.com'), true);
  assert.equal(isValidShopDomain('cool-store.myshopify.com.evil.com'), false);
  assert.equal(isValidShopDomain('cool-store.com'), false);
  assert.equal(isValidShopDomain(''), false);
  assert.equal(isValidShopDomain(null), false);
});

test('verifyOAuthHmac validates Shopify-formatted query strings', () => {
  const secret = 'shhh';
  const params = new URLSearchParams({
    code: '0907a61c0c8d55e99db179b68161bc00',
    shop: 'some-shop.myshopify.com',
    state: '0.6784241404160823',
    timestamp: '1337178173',
  });
  // Build the canonical message the same way Shopify does, sign it, append.
  const sorted = Array.from(params.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  const message = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  const sig = crypto.createHmac('sha256', secret).update(message).digest('hex');
  params.set('hmac', sig);
  assert.equal(verifyOAuthHmac(params, secret), true);
});

test('verifyOAuthHmac rejects a tampered query string', () => {
  const secret = 'shhh';
  const params = new URLSearchParams({ shop: 'a.myshopify.com', code: 'x' });
  const message = 'code=x&shop=a.myshopify.com';
  const sig = crypto.createHmac('sha256', secret).update(message).digest('hex');
  params.set('hmac', sig);
  params.set('shop', 'evil.myshopify.com');
  assert.equal(verifyOAuthHmac(params, secret), false);
});

test('OAuth state round-trips and detects tampering', () => {
  const secret = 'state-secret';
  const { state, cookie } = createOAuthState(secret);
  assert.equal(verifyOAuthState(state, cookie, secret), true);
  assert.equal(verifyOAuthState(state, cookie, 'wrong'), false);
  assert.equal(verifyOAuthState('different', cookie, secret), false);
  assert.equal(verifyOAuthState(state, null, secret), false);
});
