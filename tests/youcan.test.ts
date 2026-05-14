import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyYoucanWebhook,
  YoucanApiError,
  youcanFetchWithRetry,
} from '../lib/youcan';
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

// --- retry / backoff ------------------------------------------------------

function mockResponse(status: number, body = '', headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

function scriptedFetch(responses: Array<Response | Error>): {
  fetch: typeof fetch;
  callCount: () => number;
} {
  let i = 0;
  return {
    callCount: () => i,
    fetch: (async () => {
      if (i >= responses.length) throw new Error('no more scripted responses');
      const next = responses[i++];
      if (next instanceof Error) throw next;
      return next;
    }) as unknown as typeof fetch,
  };
}

const noSleep = async () => {};

test('youcanFetchWithRetry retries on 503 and returns the eventual 2xx', async () => {
  const mock = scriptedFetch([
    mockResponse(503),
    mockResponse(503),
    mockResponse(200, '{"ok":true}'),
  ]);
  const res = await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
    fetchImpl: mock.fetch,
    sleepImpl: noSleep,
  });
  assert.equal(res.status, 200);
  assert.equal(mock.callCount(), 3);
});

test('youcanFetchWithRetry does not retry on 401 (leaves it for the refresh wrapper)', async () => {
  const mock = scriptedFetch([mockResponse(401)]);
  const res = await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
    fetchImpl: mock.fetch,
    sleepImpl: noSleep,
  });
  assert.equal(res.status, 401);
  assert.equal(mock.callCount(), 1);
});

test('youcanFetchWithRetry does not retry on 4xx client errors', async () => {
  for (const status of [400, 403, 404, 409, 422]) {
    const mock = scriptedFetch([mockResponse(status)]);
    const res = await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
      fetchImpl: mock.fetch,
      sleepImpl: noSleep,
    });
    assert.equal(res.status, status);
    assert.equal(mock.callCount(), 1);
  }
});

test('youcanFetchWithRetry retries network errors and gives up after maxAttempts', async () => {
  const mock = scriptedFetch([
    new Error('ECONNRESET'),
    new Error('ECONNRESET'),
    new Error('ECONNRESET'),
    new Error('ECONNRESET'),
  ]);
  await assert.rejects(
    youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
      maxAttempts: 4,
      fetchImpl: mock.fetch,
      sleepImpl: noSleep,
    }),
    /ECONNRESET/,
  );
  assert.equal(mock.callCount(), 4);
});

test('youcanFetchWithRetry honours Retry-After in seconds', async () => {
  const delays: number[] = [];
  const recordingSleep = async (ms: number) => { delays.push(ms); };
  const mock = scriptedFetch([
    mockResponse(429, '', { 'retry-after': '1' }),
    mockResponse(200, 'ok'),
  ]);
  const res = await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
    fetchImpl: mock.fetch,
    sleepImpl: recordingSleep,
    maxDelayMs: 5000,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(delays, [1000]);
});

test('youcanFetchWithRetry caps Retry-After at maxDelayMs', async () => {
  const delays: number[] = [];
  const mock = scriptedFetch([
    mockResponse(429, '', { 'retry-after': '999' }),
    mockResponse(200, 'ok'),
  ]);
  await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
    fetchImpl: mock.fetch,
    sleepImpl: async (ms) => { delays.push(ms); },
    maxDelayMs: 1000,
  });
  assert.deepEqual(delays, [1000]);
});

test('youcanFetchWithRetry returns the final retryable response after exhausting attempts', async () => {
  const mock = scriptedFetch([
    mockResponse(502),
    mockResponse(502),
    mockResponse(502),
  ]);
  const res = await youcanFetchWithRetry('https://api.youcan.shop/x', {}, {
    maxAttempts: 3,
    fetchImpl: mock.fetch,
    sleepImpl: noSleep,
  });
  assert.equal(res.status, 502);
  assert.equal(mock.callCount(), 3);
});

test('OAuth state round-trips and detects tampering', () => {
  const secret = 'state-secret';
  const { state, cookie } = createOAuthState(secret);
  assert.equal(verifyOAuthState(state, cookie, secret), true);
  assert.equal(verifyOAuthState(state, cookie, 'wrong'), false);
  assert.equal(verifyOAuthState('different', cookie, secret), false);
  assert.equal(verifyOAuthState(state, null, secret), false);
});
