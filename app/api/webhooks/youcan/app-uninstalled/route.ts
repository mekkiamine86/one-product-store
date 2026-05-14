// =============================================================================
// POST /api/webhooks/youcan/app-uninstalled?m=<merchantId>
//
// Fires when a merchant uninstalls the app. We:
//   - verify the x-youcan-signature HMAC,
//   - mark the merchant inactive (so the order-create handler starts
//     rejecting their traffic with 401),
//   - clear the now-invalid access/refresh tokens.
//
// Order / WhatsAppLog history is retained for support + analytics.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyYoucanWebhook, YOUCAN_SIGNATURE_HEADER } from '@/lib/youcan';
import { log, logError, newRequestId } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const rawBody = await req.text();
  const signatureHeader = req.headers.get(YOUCAN_SIGNATURE_HEADER);
  if (!signatureHeader) {
    logError('youcan.app_uninstalled.reject', { requestId, reason: 'missing-signature' });
    return NextResponse.json(
      { error: 'missing signature header' },
      { status: 400 },
    );
  }

  const merchantId = req.nextUrl.searchParams.get('m');
  if (!merchantId) {
    logError('youcan.app_uninstalled.reject', { requestId, reason: 'missing-merchant-id' });
    return NextResponse.json(
      { error: 'missing merchant identifier' },
      { status: 400 },
    );
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) {
    // Uninstall for an unknown merchant — nothing to do; ack so YouCan
    // doesn't retry.
    log('youcan.app_uninstalled.unknown_merchant', { requestId, merchantId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!verifyYoucanWebhook(rawBody, signatureHeader, merchant.youcanWebhookSecret)) {
    logError('youcan.app_uninstalled.reject', {
      requestId,
      reason: 'invalid-signature',
      merchantId: merchant.id,
    });
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      isActive: false,
      youcanAccessToken: '',
      youcanRefreshToken: null,
    },
  });
  log('youcan.app_uninstalled.deactivated', { requestId, merchantId: merchant.id });

  return NextResponse.json({ ok: true }, { status: 200 });
}
