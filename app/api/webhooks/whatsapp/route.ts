// =============================================================================
// POST /api/webhooks/whatsapp
//
// Twilio's WhatsApp inbound webhook. Fires when a customer replies to the
// confirmation template (either by tapping "Confirm" / "Cancel" quick-reply
// buttons or by sending free text).
//
// Workflow:
//   1. Read & parse the x-www-form-urlencoded body Twilio sends.
//   2. Validate the X-Twilio-Signature header.
//   3. Find the latest PENDING order for the inbound number.
//   4. Classify the reply → CONFIRM / CANCEL / UNKNOWN.
//   5. Update the order in YouCan (status + note) and in our DB.
//   6. Reply with empty TwiML so Twilio doesn't echo anything back.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { appendOrderNote, updateOrderStatus } from '@/lib/youcan';
import {
  classifyReply,
  validateTwilioSignature,
  type ReplyIntent,
} from '@/lib/whatsapp';
import { fromWhatsAppAddress } from '@/lib/phone';
import {
  OrderStatus,
  WhatsAppDirection,
  WhatsAppMessageStatus,
  type Merchant,
  type Order,
} from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Empty TwiML — we don't need to reply; Twilio is just notifying us.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
const twimlResponse = () =>
  new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const formParams: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => {
    formParams[k] = v;
  });

  const signature = req.headers.get('x-twilio-signature');

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: 'twilio auth not configured' }, { status: 500 });
  }

  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const fullUrl = publicBase
    ? `${publicBase}${new URL(req.url).pathname}`
    : req.url;

  if (!validateTwilioSignature(fullUrl, formParams, signature, authToken)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const fromAddr = formParams['From'] ?? '';
  const toAddr = formParams['To'] ?? '';
  const body = formParams['Body'] ?? '';
  const buttonPayload = formParams['ButtonPayload'] ?? null;
  const customerE164 = fromWhatsApp(fromAddr);
  const merchantWhatsApp = fromWhatsApp(toAddr);

  if (!customerE164 || !merchantWhatsApp) {
    return twimlResponse();
  }

  const merchant = await prisma.merchant.findFirst({
    where: { whatsappFromNumber: merchantWhatsApp, isActive: true },
  });
  if (!merchant) {
    return twimlResponse();
  }

  const order = await prisma.order.findFirst({
    where: {
      merchantId: merchant.id,
      customerPhone: customerE164,
      status: OrderStatus.PENDING_CONFIRMATION,
    },
    orderBy: { createdAt: 'desc' },
  });

  await prisma.whatsAppLog.create({
    data: {
      merchantId: merchant.id,
      orderId: order?.id ?? null,
      direction: WhatsAppDirection.INBOUND,
      providerMessageId: formParams['MessageSid'] ?? null,
      fromNumber: customerE164,
      toNumber: merchantWhatsApp,
      body,
      buttonPayload,
      status: WhatsAppMessageStatus.RECEIVED,
      rawPayload: formParams as unknown as object,
    },
  });

  if (!order) return twimlResponse();

  const intent: ReplyIntent =
    buttonPayload ? classifyReply(buttonPayload) : classifyReply(body);

  if (intent === 'UNKNOWN') return twimlResponse();

  try {
    await applyIntent(merchant, order, intent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.whatsAppLog.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        direction: WhatsAppDirection.INBOUND,
        fromNumber: customerE164,
        toNumber: merchantWhatsApp,
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: `YouCan sync failed: ${message}`.slice(0, 1000),
      },
    });
  }

  return twimlResponse();
}

function fromWhatsApp(addr: string | undefined): string | null {
  if (!addr) return null;
  const v = fromWhatsAppAddress(addr).trim();
  return v.length > 0 ? v : null;
}

async function applyIntent(
  merchant: Merchant,
  order: Order,
  intent: 'CONFIRM' | 'CANCEL',
): Promise<void> {
  const auth = { accessToken: merchant.youcanAccessToken };

  if (intent === 'CONFIRM') {
    await updateOrderStatus(auth, order.youcanOrderId, 'confirmed');
    await appendOrderNote(
      auth,
      order.youcanOrderId,
      `COD order confirmed by customer via WhatsApp on ${new Date().toISOString()}`,
    );
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CONFIRMED,
        respondedAt: new Date(),
        youcanUpdatedAt: new Date(),
      },
    });
    return;
  }

  // CANCEL
  await updateOrderStatus(auth, order.youcanOrderId, 'cancelled');
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.CANCELLED,
      respondedAt: new Date(),
      youcanUpdatedAt: new Date(),
    },
  });
}
