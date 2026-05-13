// =============================================================================
// POST /api/webhooks/youcan/app-uninstalled
//
// YouCan fires this when a merchant uninstalls the app. We:
//   - verify the HMAC,
//   - mark the merchant inactive (so the order-create handler will start
//     rejecting their traffic),
//   - zero out the now-invalid access token.
//
// The Order / WhatsAppLog history is kept for support + analytics.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyYoucanWebhook } from '@/lib/youcan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HMAC_HEADER = 'x-youcan-hmac-sha256'; // VERIFY
const SLUG_HEADER = 'x-youcan-store';       // VERIFY (fallback to payload)

interface UninstallPayload {
  store?: { slug?: string; domain?: string };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get(HMAC_HEADER);
  if (!hmacHeader) {
    return NextResponse.json({ error: 'missing signature header' }, { status: 400 });
  }

  let payload: UninstallPayload = {};
  try {
    payload = JSON.parse(rawBody) as UninstallPayload;
  } catch {
    // tolerate empty / non-JSON uninstall payloads
  }
  const storeSlug =
    req.headers.get(SLUG_HEADER) ??
    payload.store?.slug ??
    payload.store?.domain ??
    null;
  if (!storeSlug) {
    return NextResponse.json({ error: 'cannot identify store' }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({
    where: { youcanStoreSlug: storeSlug },
  });
  if (!merchant) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!verifyYoucanWebhook(rawBody, hmacHeader, merchant.youcanWebhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      isActive: false,
      youcanAccessToken: '',     // token is revoked by YouCan on uninstall
      youcanRefreshToken: null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
