// =============================================================================
// GET /api/cron/expire-pending
//
// Expire orders that have been PENDING_CONFIRMATION for too long. Designed
// for Vercel Cron (configured in vercel.json) — Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` automatically.
//
// Default window: 24h. Override with `PENDING_EXPIRY_HOURS`.
// =============================================================================

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { log, logError, newRequestId } from '@/lib/log';
import { OrderStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logError('cron.expire_pending.reject', { requestId, reason: 'unconfigured' });
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!timingSafeEqualStr(provided, expected)) {
    logError('cron.expire_pending.reject', { requestId, reason: 'unauthorized' });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hours = Number(process.env.PENDING_EXPIRY_HOURS ?? 24);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);

  const start = Date.now();
  const { count } = await prisma.order.updateMany({
    where: {
      status: OrderStatus.PENDING_CONFIRMATION,
      createdAt: { lt: cutoff },
    },
    data: { status: OrderStatus.EXPIRED },
  });

  log('cron.expire_pending.ran', {
    requestId,
    hours,
    cutoff: cutoff.toISOString(),
    expired: count,
    durationMs: Date.now() - start,
  });

  return NextResponse.json({ ok: true, expired: count, cutoff }, { status: 200 });
}
