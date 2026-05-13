// =============================================================================
// POST /api/webhooks/twilio/status
//
// Twilio Message-Status callback. Configure this URL when sending the
// confirmation template via `statusCallback`, or set it as the default on
// the Twilio Messaging Service. Updates the matching WhatsAppLog row so
// the dashboard can show queued → sent → delivered → read.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateTwilioSignature } from '@/lib/whatsapp';
import { WhatsAppMessageStatus } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  queued: WhatsAppMessageStatus.QUEUED,
  accepted: WhatsAppMessageStatus.QUEUED,
  scheduled: WhatsAppMessageStatus.QUEUED,
  sending: WhatsAppMessageStatus.SENT,
  sent: WhatsAppMessageStatus.SENT,
  delivered: WhatsAppMessageStatus.DELIVERED,
  read: WhatsAppMessageStatus.READ,
  undelivered: WhatsAppMessageStatus.FAILED,
  failed: WhatsAppMessageStatus.FAILED,
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => {
    params[k] = v;
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: 'twilio not configured' }, { status: 500 });
  }
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const fullUrl = publicBase
    ? `${publicBase}${new URL(req.url).pathname}`
    : req.url;
  if (!validateTwilioSignature(fullUrl, params, req.headers.get('x-twilio-signature'), authToken)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const sid = params['MessageSid'];
  const rawStatus = (params['MessageStatus'] ?? '').toLowerCase();
  if (!sid || !rawStatus) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const mapped = STATUS_MAP[rawStatus];
  if (!mapped) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await prisma.whatsAppLog.updateMany({
    where: { providerMessageId: sid },
    data: {
      status: mapped,
      errorMessage: params['ErrorMessage'] ?? params['ErrorCode'] ?? undefined,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
