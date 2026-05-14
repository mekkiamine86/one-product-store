import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyYoucanWebhook, YoucanApiError } from '../lib/youcan';
import {
  buildAuthorizeUrl,
  createOAuthState,
  refreshAccessToken,
  verifyOAuthState,
  withAutoRefresh,
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

// --- refresh / auto-refresh ------------------------------------------------

function stubFetch<T extends (input: any, init?: any) => Promise<Response>>(impl: T) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = previous;
  };
}

const APP_CONFIG = {
  clientId: 'cid',
  clientSecret: 'sec',
  scopes: ['*'],
  appUrl: 'https://app.example.com',
};

test('refreshAccessToken posts the standard refresh_token grant', async () => {
  let captured: { url: string; body: string; method: string } | null = null;
  const restore = stubFetch(async (input, init) => {
    captured = {
      url: String(input),
      body: String(init?.body ?? ''),
      method: String(init?.method ?? 'GET'),
    };
    return new Response(
      JSON.stringify({ access_token: 'new-AT', refresh_token: 'new-RT', scope: '*' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  try {
    const result = await refreshAccessToken({
      refreshToken: 'old-RT',
      config: APP_CONFIG,
    });
    assert.equal(result.accessToken, 'new-AT');
    assert.equal(result.refreshToken, 'new-RT');
    assert.equal(captured!.method, 'POST');
    assert.equal(captured!.url, 'https://api.youcan.shop/oauth/token');
    const body = new URLSearchParams(captured!.body);
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('client_id'), 'cid');
    assert.equal(body.get('client_secret'), 'sec');
    assert.equal(body.get('refresh_token'), 'old-RT');
  } finally {
    restore();
  }
});

test('refreshAccessToken returns null refreshToken when server omits it', async () => {
  const restore = stubFetch(async () =>
    new Response(JSON.stringify({ access_token: 'new-AT' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  try {
    const result = await refreshAccessToken({
      refreshToken: 'old-RT',
      config: APP_CONFIG,
    });
    assert.equal(result.refreshToken, null);
  } finally {
    restore();
  }
});

test('withAutoRefresh returns the first call result when no error', async () => {
  let calls = 0;
  const persisted: unknown[] = [];
  const result = await withAutoRefresh(
    {
      merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: 'RT-1' },
      persistTokens: async (t) => void persisted.push(t),
      refresh: async () => {
        throw new Error('should not refresh');
      },
    },
    async (auth) => {
      calls++;
      assert.equal(auth.accessToken, 'AT-1');
      return 'ok' as const;
    },
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
  assert.equal(persisted.length, 0);
});

test('withAutoRefresh retries once on 401 and persists new tokens', async () => {
  let calls = 0;
  const persisted: { accessToken: string; refreshToken: string | null }[] = [];
  const result = await withAutoRefresh(
    {
      merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: 'RT-1' },
      persistTokens: async (t) => void persisted.push(t),
      refresh: async ({ refreshToken }) => {
        assert.equal(refreshToken, 'RT-1');
        return { accessToken: 'AT-2', refreshToken: 'RT-2', scope: null };
      },
    },
    async (auth) => {
      calls++;
      if (calls === 1) {
        assert.equal(auth.accessToken, 'AT-1');
        throw new YoucanApiError(401, 'unauthorized');
      }
      assert.equal(auth.accessToken, 'AT-2');
      return 'recovered' as const;
    },
  );
  assert.equal(result, 'recovered');
  assert.equal(calls, 2);
  assert.deepEqual(persisted, [{ accessToken: 'AT-2', refreshToken: 'RT-2' }]);
});

test('withAutoRefresh keeps the previous refresh_token if server omits one', async () => {
  const persisted: { accessToken: string; refreshToken: string | null }[] = [];
  await withAutoRefresh(
    {
      merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: 'RT-1' },
      persistTokens: async (t) => void persisted.push(t),
      refresh: async () => ({ accessToken: 'AT-2', refreshToken: null, scope: null }),
    },
    async (auth) => {
      if (auth.accessToken === 'AT-1') throw new YoucanApiError(401, 'unauthorized');
      return 'ok' as const;
    },
  );
  assert.deepEqual(persisted, [{ accessToken: 'AT-2', refreshToken: 'RT-1' }]);
});

test('withAutoRefresh propagates non-401 errors without refreshing', async () => {
  let refreshed = false;
  await assert.rejects(
    withAutoRefresh(
      {
        merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: 'RT-1' },
        persistTokens: async () => {},
        refresh: async () => {
          refreshed = true;
          return { accessToken: 'AT-2', refreshToken: null, scope: null };
        },
      },
      async () => {
        throw new YoucanApiError(500, 'boom');
      },
    ),
    (err) => err instanceof YoucanApiError && err.status === 500,
  );
  assert.equal(refreshed, false);
});

test('withAutoRefresh propagates the 401 when no refresh token is available', async () => {
  let refreshed = false;
  await assert.rejects(
    withAutoRefresh(
      {
        merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: null },
        persistTokens: async () => {},
        refresh: async () => {
          refreshed = true;
          return { accessToken: 'AT-2', refreshToken: null, scope: null };
        },
      },
      async () => {
        throw new YoucanApiError(401, 'unauthorized');
      },
    ),
    (err) => err instanceof YoucanApiError && err.status === 401,
  );
  assert.equal(refreshed, false);
});

test('withAutoRefresh does not retry a second time on a second 401', async () => {
  let calls = 0;
  await assert.rejects(
    withAutoRefresh(
      {
        merchant: { youcanAccessToken: 'AT-1', youcanRefreshToken: 'RT-1' },
        persistTokens: async () => {},
        refresh: async () => ({ accessToken: 'AT-2', refreshToken: 'RT-2', scope: null }),
      },
      async () => {
        calls++;
        throw new YoucanApiError(401, 'still unauthorized');
      },
    ),
    (err) => err instanceof YoucanApiError && err.status === 401,
  );
  assert.equal(calls, 2);
});

test('OAuth state round-trips and detects tampering', () => {
  const secret = 'state-secret';
  const { state, cookie } = createOAuthState(secret);
  assert.equal(verifyOAuthState(state, cookie, secret), true);
  assert.equal(verifyOAuthState(state, cookie, 'wrong'), false);
  assert.equal(verifyOAuthState('different', cookie, secret), false);
  assert.equal(verifyOAuthState(state, null, secret), false);
});
