// =============================================================================
// GET /api/cron/expire-pending
//
// Expire orders that have been PENDING_CONFIRMATION for too long. Designed
// for Vercel Cron (or any external scheduler) — pass `CRON_SECRET` as a
// `Authorization: Bearer ...` header.
//
// Default window: 24h. Override with `PENDING_EXPIRY_HOURS`.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OrderStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hours = Number(process.env.PENDING_EXPIRY_HOURS ?? 24);
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);

  const { count } = await prisma.order.updateMany({
    where: {
      status: OrderStatus.PENDING_CONFIRMATION,
      createdAt: { lt: cutoff },
    },
    data: { status: OrderStatus.EXPIRED },
  });

  return NextResponse.json({ ok: true, expired: count, cutoff }, { status: 200 });
}
