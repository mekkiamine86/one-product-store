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
//   5. Update the order in Shopify (tag or cancel) and in our DB.
//   6. Reply with empty TwiML so Twilio doesn't echo anything back.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  addOrderTags,
  appendOrderNote,
  cancelShopifyOrder,
} from '@/lib/shopify';
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
  // 1. Parse form-urlencoded body.
  const rawBody = await req.text();
  const formParams: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => {
    formParams[k] = v;
  });

  const signature = req.headers.get('x-twilio-signature');

  // 2. Validate signature.
  //
  // The signed URL must match the *public* URL Twilio called. If you're
  // behind a proxy (Vercel, ngrok, Cloudflare) the proto/host can differ
  // from what `req.url` reports — let operators override via env var.
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

  // 3. Find the order.
  const fromAddr = formParams['From'] ?? '';            // "whatsapp:+213..."
  const toAddr = formParams['To'] ?? '';                // our number
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
    // Unknown destination number — ack silently. Don't 4xx; Twilio would retry.
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

  // Always log the inbound message, even if we can't match it to an order.
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

  // 4. Classify. Prefer the explicit button payload if Twilio supplied one.
  const intent: ReplyIntent =
    buttonPayload ? classifyReply(buttonPayload) : classifyReply(body);

  if (intent === 'UNKNOWN') return twimlResponse();

  // 5. Apply.
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
        errorMessage: `Shopify sync failed: ${message}`.slice(0, 1000),
      },
    });
  }

  return twimlResponse();
}

// --- helpers ----------------------------------------------------------------

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
  const auth = {
    shopDomain: merchant.shopifyDomain,
    accessToken: merchant.shopifyAccessToken,
  };

  if (intent === 'CONFIRM') {
    await addOrderTags(auth, order.shopifyOrderId, ['cod-confirmed', 'whatsapp-confirmed']);
    await appendOrderNote(
      auth,
      order.shopifyOrderId,
      `COD order confirmed by customer via WhatsApp on ${new Date().toISOString()}`,
    );
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CONFIRMED,
        respondedAt: new Date(),
        shopifyUpdatedAt: new Date(),
      },
    });
    return;
  }

  // CANCEL
  await cancelShopifyOrder(auth, order.shopifyOrderId, 'customer');
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.CANCELLED,
      respondedAt: new Date(),
      shopifyUpdatedAt: new Date(),
    },
  });
}
