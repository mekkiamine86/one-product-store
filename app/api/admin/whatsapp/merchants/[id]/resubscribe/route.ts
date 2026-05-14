// =============================================================================
// POST /api/admin/whatsapp/merchants/[id]/resubscribe
//
// Operator-triggered re-registration of the YouCan REST Hook subscriptions
// for this merchant. Useful when:
//   - YouCan lost a subscription (rotated their internal store, etc.),
//   - we changed the target_url scheme between deploys,
//   - the order.create webhooks just stopped arriving and we want to retry
//     without forcing the merchant through a re-install.
//
// ensureWebhook() treats 2xx and 409/422 ("already subscribed") as success,
// so this is safe to fire repeatedly.
//
// Auth: admin session cookie (same as the rest of /admin).
// =============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthorized } from '@/lib/auth-server';
import { ensureWebhook, getYoucanAppConfig } from '@/lib/youcan-oauth';
import { log, logError } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENTS = ['order.create', 'app.uninstalled'] as const;
type Event = (typeof EVENTS)[number];

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAdminAuthorized())) {
    logError('admin.merchant.resubscribe_reject', {
      reason: 'unauthorized',
      merchantId: params.id,
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: params.id } });
  if (!merchant) {
    logError('admin.merchant.resubscribe_reject', {
      reason: 'not-found',
      merchantId: params.id,
    });
    return NextResponse.json({ error: 'merchant not found' }, { status: 404 });
  }
  if (!merchant.isActive || !merchant.youcanAccessToken) {
    logError('admin.merchant.resubscribe_reject', {
      reason: 'inactive-or-no-token',
      merchantId: params.id,
    });
    return NextResponse.json(
      { error: 'merchant is inactive or has no access token' },
      { status: 409 },
    );
  }

  let cfg;
  try {
    cfg = getYoucanAppConfig();
  } catch (err) {
    logError('admin.merchant.resubscribe_reject', {
      reason: 'app-not-configured',
      merchantId: params.id,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'app not configured' },
      { status: 500 },
    );
  }

  const target = (path: string) =>
    `${cfg.appUrl}${path}?m=${encodeURIComponent(merchant.id)}`;
  const url: Record<Event, string> = {
    'order.create': target('/api/webhooks/youcan/order-create'),
    'app.uninstalled': target('/api/webhooks/youcan/app-uninstalled'),
  };

  // Run each subscribe call independently — report partial failures rather
  // than aborting on the first error.
  const results = await Promise.all(
    EVENTS.map(async (event) => {
      try {
        await ensureWebhook({
          accessToken: merchant.youcanAccessToken,
          event,
          targetUrl: url[event],
        });
        return { event, ok: true as const };
      } catch (err) {
        return {
          event,
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const allOk = results.every((r) => r.ok);
  log('admin.merchant.resubscribed', {
    merchantId: merchant.id,
    allOk,
    events: results.map((r) => r.event).join(','),
  });
  return NextResponse.json(
    { ok: allOk, results },
    { status: allOk ? 200 : 502 },
  );
}
