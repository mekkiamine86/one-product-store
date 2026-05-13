// =============================================================================
// POST /api/admin/whatsapp/orders/[id]/resend
//
// Operator-triggered retry of the WhatsApp confirmation for a single order.
// Auth: admin session cookie (same as the rest of /admin).
// =============================================================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthorized } from '@/lib/auth-server';
import { sendOrderConfirmation } from '@/lib/send-confirmation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { merchant: true },
  });
  if (!order) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 });
  }
  if (!order.merchant.isActive) {
    return NextResponse.json({ error: 'merchant is inactive' }, { status: 409 });
  }

  const outcome = await sendOrderConfirmation(order.merchant, order);
  const status = outcome.ok ? 200 : 502;
  return NextResponse.json(outcome, { status });
}
