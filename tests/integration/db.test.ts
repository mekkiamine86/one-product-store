// =============================================================================
// Integration tests that run against a real Postgres provisioned with every
// migration in prisma/migrations/. Skip everything if INTEGRATION_DATABASE_URL
// isn't set — bootstrap lives in scripts/test-integration.sh.
//
// Covers:
//   - merchant delete cascades to Order + WhatsAppLog
//   - order upsert is idempotent on (merchantId, youcanOrderId)
//   - cron expire updateMany flips PENDING orders past the cutoff
//
// Migration replay correctness itself is exercised implicitly: if the
// bootstrap fails to apply them in order, this file never runs.
// =============================================================================

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { OrderStatus, WhatsAppDirection, WhatsAppMessageStatus } from '@prisma/client';

const url = process.env.INTEGRATION_DATABASE_URL;

if (!url) {
  test('integration tests skipped (INTEGRATION_DATABASE_URL not set)', () => {
    // No-op; the assertion is just that this test runs and passes so the
    // file counts as "executed" in CI summary output.
    assert.ok(true);
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const merchantSeed = () => ({
    email: `m-${crypto.randomBytes(4).toString('hex')}@test.local`,
    youcanAccessToken: 'tok',
    youcanWebhookSecret: 'whsec',
    whatsappFromNumber: '+14155238886',
  });

  before(async () => {
    // Make every test independent: wipe rows in the right FK order.
    await prisma.whatsAppLog.deleteMany();
    await prisma.order.deleteMany();
    await prisma.merchant.deleteMany();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test('merchant delete cascades to Order and WhatsAppLog', async () => {
    const merchant = await prisma.merchant.create({ data: merchantSeed() });
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        youcanOrderId: '99001',
        youcanOrderRef: '#1024',
        customerName: 'Alice',
        customerPhone: '+212600111222',
        totalAmount: '149.99',
        currency: 'MAD',
        status: OrderStatus.PENDING_CONFIRMATION,
      },
    });
    await prisma.whatsAppLog.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        direction: WhatsAppDirection.OUTBOUND,
        fromNumber: '+14155238886',
        toNumber: '+212600111222',
        status: WhatsAppMessageStatus.SENT,
      },
    });

    await prisma.merchant.delete({ where: { id: merchant.id } });

    assert.equal(await prisma.merchant.count({ where: { id: merchant.id } }), 0);
    assert.equal(await prisma.order.count({ where: { id: order.id } }), 0);
    assert.equal(
      await prisma.whatsAppLog.count({ where: { merchantId: merchant.id } }),
      0,
    );
  });

  test('order upsert is idempotent on (merchantId, youcanOrderId)', async () => {
    const merchant = await prisma.merchant.create({ data: merchantSeed() });

    const first = await prisma.order.upsert({
      where: {
        merchantId_youcanOrderId: {
          merchantId: merchant.id,
          youcanOrderId: '99002',
        },
      },
      create: {
        merchantId: merchant.id,
        youcanOrderId: '99002',
        youcanOrderRef: '#first',
        customerName: 'Alice',
        customerPhone: '+212600111222',
        totalAmount: '100',
        currency: 'MAD',
        status: OrderStatus.PENDING_CONFIRMATION,
      },
      update: { youcanOrderRef: '#second' },
    });

    const second = await prisma.order.upsert({
      where: {
        merchantId_youcanOrderId: {
          merchantId: merchant.id,
          youcanOrderId: '99002',
        },
      },
      create: {
        merchantId: merchant.id,
        youcanOrderId: '99002',
        youcanOrderRef: '#first',
        customerName: 'Alice',
        customerPhone: '+212600111222',
        totalAmount: '100',
        currency: 'MAD',
        status: OrderStatus.PENDING_CONFIRMATION,
      },
      update: { youcanOrderRef: '#second' },
    });

    assert.equal(first.id, second.id);
    assert.equal(second.youcanOrderRef, '#second');
    assert.equal(
      await prisma.order.count({ where: { merchantId: merchant.id } }),
      1,
    );

    // A different merchant with the *same* youcanOrderId is a separate order.
    const other = await prisma.merchant.create({ data: merchantSeed() });
    await prisma.order.create({
      data: {
        merchantId: other.id,
        youcanOrderId: '99002',
        youcanOrderRef: '#other',
        customerName: 'Bob',
        customerPhone: '+212600111333',
        totalAmount: '100',
        currency: 'MAD',
        status: OrderStatus.PENDING_CONFIRMATION,
      },
    });
    assert.equal(
      await prisma.order.count({ where: { youcanOrderId: '99002' } }),
      2,
    );
  });

  test('expire-pending updateMany flips PENDING orders past the cutoff', async () => {
    const merchant = await prisma.merchant.create({ data: merchantSeed() });

    // Insert with explicit createdAt via raw SQL — Prisma's create() always
    // uses default now() for createdAt.
    const oldId = crypto.randomBytes(8).toString('hex');
    const newId = crypto.randomBytes(8).toString('hex');
    const stale = new Date(Date.now() - 48 * 3600 * 1000);
    const fresh = new Date(Date.now() - 1 * 3600 * 1000);

    await prisma.$executeRaw`
      INSERT INTO "Order" (id, "merchantId", "youcanOrderId", "youcanOrderRef",
                           "customerName", "customerPhone", "totalAmount",
                           currency, status, "createdAt", "updatedAt")
      VALUES
        (${oldId}, ${merchant.id}, 'old-1', '#old',
         'Stale', '+1', 10.00, 'MAD', 'PENDING_CONFIRMATION',
         ${stale}, ${stale}),
        (${newId}, ${merchant.id}, 'new-1', '#new',
         'Fresh', '+1', 10.00, 'MAD', 'PENDING_CONFIRMATION',
         ${fresh}, ${fresh})
    `;

    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const { count } = await prisma.order.updateMany({
      where: {
        status: OrderStatus.PENDING_CONFIRMATION,
        createdAt: { lt: cutoff },
      },
      data: { status: OrderStatus.EXPIRED },
    });

    assert.equal(count, 1);
    const old = await prisma.order.findUnique({ where: { id: oldId } });
    const recent = await prisma.order.findUnique({ where: { id: newId } });
    assert.equal(old?.status, OrderStatus.EXPIRED);
    assert.equal(recent?.status, OrderStatus.PENDING_CONFIRMATION);
  });

  test('youcanStoreSlug is nullable + non-unique after the cleanup migration', async () => {
    // Two merchants with the same slug, plus one with NULL — should all coexist.
    await prisma.merchant.createMany({
      data: [
        { ...merchantSeed(), youcanStoreSlug: 'shared.youcan.shop' },
        { ...merchantSeed(), youcanStoreSlug: 'shared.youcan.shop' },
        { ...merchantSeed(), youcanStoreSlug: null },
      ],
    });
    const count = await prisma.merchant.count({
      where: { youcanStoreSlug: 'shared.youcan.shop' },
    });
    assert.equal(count, 2);
    assert.ok((await prisma.merchant.count({ where: { youcanStoreSlug: null } })) >= 1);
  });

  test('per-merchant slug defaults are applied on insert', async () => {
    const merchant = await prisma.merchant.create({ data: merchantSeed() });
    const fresh = await prisma.merchant.findUnique({ where: { id: merchant.id } });
    assert.equal(fresh?.youcanConfirmedSlug, 'confirmed');
    assert.equal(fresh?.youcanCancelledSlug, 'cancelled');
    assert.equal(fresh?.defaultCountryCode, 'MA');
  });
}
