// =============================================================================
// Integration tests for the expire-pending cron handler. Invokes the GET
// route directly with a constructed Request, exercising:
//   - bearer auth (correct, missing, wrong, malformed)
//   - the cutoff math (PENDING orders past PENDING_EXPIRY_HOURS expire;
//     fresh PENDING orders and non-PENDING orders are untouched)
//   - idempotent re-runs (second invocation expires 0 orders)
//
// Requires INTEGRATION_DATABASE_URL (set by scripts/test-integration.sh).
// Skips silently otherwise so `npm test` still works everywhere.
// =============================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const url = process.env.INTEGRATION_DATABASE_URL;

if (!url) {
  test('cron integration tests skipped (INTEGRATION_DATABASE_URL not set)', () => {
    assert.ok(true);
  });
} else {
  const SECRET = 'test-cron-secret';
  process.env.CRON_SECRET = SECRET;
  process.env.PENDING_EXPIRY_HOURS = '24';

  // Dynamic imports moved into before() because tsx compiles tests to CJS,
  // which forbids top-level await. Captured into module-scoped bindings so
  // every test() block can reach them.
  let GET: (req: Request) => Promise<Response>;
  let prisma: import('@prisma/client').PrismaClient;
  let OrderStatus: typeof import('@prisma/client').OrderStatus;

  const merchantSeed = () => ({
    email: `cron-${crypto.randomBytes(4).toString('hex')}@test.local`,
    youcanAccessToken: 'tok',
    youcanWebhookSecret: 'whsec',
    whatsappFromNumber: '+14155238886',
  });

  const buildReq = (auth?: string) =>
    new Request('https://example.com/api/cron/expire-pending', {
      headers: auth ? { authorization: auth } : {},
    });

  before(async () => {
    GET = (await import('../../app/api/cron/expire-pending/route')).GET as typeof GET;
    prisma = (await import('../../lib/prisma')).prisma;
    OrderStatus = (await import('@prisma/client')).OrderStatus;
    await prisma.whatsAppLog.deleteMany();
    await prisma.order.deleteMany();
    await prisma.merchant.deleteMany();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test('rejects with 401 when no Authorization header is present', async () => {
    const res = await GET(buildReq());
    assert.equal(res.status, 401);
  });

  test('rejects with 401 on a wrong bearer secret', async () => {
    const res = await GET(buildReq('Bearer wrong-secret'));
    assert.equal(res.status, 401);
  });

  test('accepts the secret with or without a "Bearer " prefix', async () => {
    // The handler strips "Bearer " before comparing but doesn't *require* it.
    // Vercel Cron always sends the prefix; this test pins the lenient behaviour
    // so future tightening is a conscious decision rather than an accident.
    const res = await GET(buildReq(SECRET));
    assert.equal(res.status, 200);
  });

  test('returns 500 when CRON_SECRET is unset', async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = await GET(buildReq('Bearer anything'));
      assert.equal(res.status, 500);
    } finally {
      process.env.CRON_SECRET = previous;
    }
  });

  test('expires PENDING orders older than the cutoff, leaves the rest', async () => {
    await prisma.whatsAppLog.deleteMany();
    await prisma.order.deleteMany();
    await prisma.merchant.deleteMany();
    const merchant = await prisma.merchant.create({ data: merchantSeed() });

    const ids = {
      stale: crypto.randomBytes(8).toString('hex'),
      fresh: crypto.randomBytes(8).toString('hex'),
      staleConfirmed: crypto.randomBytes(8).toString('hex'),
    };
    const stale = new Date(Date.now() - 48 * 3600 * 1000);
    const fresh = new Date(Date.now() - 1 * 3600 * 1000);

    await prisma.$executeRaw`
      INSERT INTO "Order" (id, "merchantId", "youcanOrderId", "youcanOrderRef",
                           "customerName", "customerPhone", "totalAmount",
                           currency, status, "createdAt", "updatedAt")
      VALUES
        (${ids.stale}, ${merchant.id}, 'cron-stale', '#stale',
         'Stale', '+1', 10.00, 'MAD', 'PENDING_CONFIRMATION',
         ${stale}, ${stale}),
        (${ids.fresh}, ${merchant.id}, 'cron-fresh', '#fresh',
         'Fresh', '+1', 10.00, 'MAD', 'PENDING_CONFIRMATION',
         ${fresh}, ${fresh}),
        (${ids.staleConfirmed}, ${merchant.id}, 'cron-done', '#done',
         'Done',  '+1', 10.00, 'MAD', 'CONFIRMED',
         ${stale}, ${stale})
    `;

    const res = await GET(buildReq(`Bearer ${SECRET}`));
    assert.equal(res.status, 200);
    const data = (await res.json()) as { ok: boolean; expired: number };
    assert.equal(data.ok, true);
    assert.equal(data.expired, 1);

    const stateAfter = Object.fromEntries(
      (
        await prisma.order.findMany({
          where: { id: { in: Object.values(ids) } },
          select: { id: true, status: true },
        })
      ).map((o) => [o.id, o.status]),
    );
    assert.equal(stateAfter[ids.stale], OrderStatus.EXPIRED);
    assert.equal(stateAfter[ids.fresh], OrderStatus.PENDING_CONFIRMATION);
    assert.equal(stateAfter[ids.staleConfirmed], OrderStatus.CONFIRMED);
  });

  test('idempotent: a second run with nothing to expire returns 200 with 0', async () => {
    const res = await GET(buildReq(`Bearer ${SECRET}`));
    assert.equal(res.status, 200);
    const data = (await res.json()) as { ok: boolean; expired: number };
    assert.equal(data.ok, true);
    assert.equal(data.expired, 0);
  });

  test('respects PENDING_EXPIRY_HOURS override', async () => {
    await prisma.whatsAppLog.deleteMany();
    await prisma.order.deleteMany();
    await prisma.merchant.deleteMany();
    const merchant = await prisma.merchant.create({ data: merchantSeed() });

    const id = crypto.randomBytes(8).toString('hex');
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);

    await prisma.$executeRaw`
      INSERT INTO "Order" (id, "merchantId", "youcanOrderId", "youcanOrderRef",
                           "customerName", "customerPhone", "totalAmount",
                           currency, status, "createdAt", "updatedAt")
      VALUES (${id}, ${merchant.id}, 'cron-6h', '#6h',
              'Six', '+1', 10.00, 'MAD', 'PENDING_CONFIRMATION',
              ${sixHoursAgo}, ${sixHoursAgo})
    `;

    // With the default 24h window, the 6h-old order should NOT expire.
    process.env.PENDING_EXPIRY_HOURS = '24';
    let res = await GET(buildReq(`Bearer ${SECRET}`));
    let data = (await res.json()) as { expired: number };
    assert.equal(data.expired, 0);

    // Tighten the window to 1h — now it should.
    process.env.PENDING_EXPIRY_HOURS = '1';
    res = await GET(buildReq(`Bearer ${SECRET}`));
    data = (await res.json()) as { expired: number };
    assert.equal(data.expired, 1);

    process.env.PENDING_EXPIRY_HOURS = '24'; // restore for other tests
  });
}
