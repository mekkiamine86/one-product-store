// =============================================================================
// Shared "send the COD confirmation for this order" logic.
//
// Used by:
//   - app/api/webhooks/youcan/order-create   (first attempt on order intake)
//   - app/api/admin/whatsapp/orders/[id]/resend  (operator-triggered retry)
//
// Idempotency: the caller decides whether to invoke this. We always write a
// WhatsAppLog row — success or failure — so the dashboard timeline reflects
// every attempt.
// =============================================================================

import { prisma } from '@/lib/prisma';
import { sendConfirmationTemplate } from '@/lib/whatsapp';
import { toWhatsAppAddress } from '@/lib/phone';
import {
  OrderStatus,
  WhatsAppDirection,
  WhatsAppMessageStatus,
  type Merchant,
  type Order,
} from '@prisma/client';

export type SendOutcome =
  | { ok: true; sid: string }
  | { ok: false; reason: 'no-phone' | 'no-template' | 'no-sender' | 'send-failed'; error?: string };

export async function sendOrderConfirmation(
  merchant: Merchant,
  order: Order,
): Promise<SendOutcome> {
  if (!order.customerPhone) {
    await logFailure(merchant, order, '', 'Unparseable customer phone number');
    return { ok: false, reason: 'no-phone' };
  }
  if (!merchant.whatsappFromNumber) {
    await logFailure(merchant, order, order.customerPhone, 'Merchant has no whatsappFromNumber');
    return { ok: false, reason: 'no-sender' };
  }
  if (!merchant.whatsappTemplateSid) {
    await logFailure(merchant, order, order.customerPhone, 'Merchant has no whatsappTemplateSid');
    return { ok: false, reason: 'no-template' };
  }

  const firstName = order.customerName.split(' ')[0] || order.customerName;
  const total = `${order.totalAmount.toString()} ${order.currency}`;

  try {
    const result = await sendConfirmationTemplate({
      fromWhatsApp: toWhatsAppAddress(merchant.whatsappFromNumber),
      toWhatsApp: toWhatsAppAddress(order.customerPhone),
      contentSid: merchant.whatsappTemplateSid,
      variables: {
        '1': order.youcanOrderRef,
        '2': firstName,
        '3': total,
      },
    });

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PENDING_CONFIRMATION,
          confirmationSentAt: new Date(),
        },
      }),
      prisma.whatsAppLog.create({
        data: {
          merchantId: merchant.id,
          orderId: order.id,
          direction: WhatsAppDirection.OUTBOUND,
          providerMessageId: result.sid,
          fromNumber: merchant.whatsappFromNumber,
          toNumber: order.customerPhone,
          status: WhatsAppMessageStatus.SENT,
        },
      }),
    ]);
    return { ok: true, sid: result.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      }),
      prisma.whatsAppLog.create({
        data: {
          merchantId: merchant.id,
          orderId: order.id,
          direction: WhatsAppDirection.OUTBOUND,
          fromNumber: merchant.whatsappFromNumber,
          toNumber: order.customerPhone,
          status: WhatsAppMessageStatus.FAILED,
          errorMessage: message.slice(0, 1000),
        },
      }),
    ]);
    return { ok: false, reason: 'send-failed', error: message };
  }
}

async function logFailure(
  merchant: Merchant,
  order: Order,
  toNumber: string,
  errorMessage: string,
) {
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.FAILED },
    }),
    prisma.whatsAppLog.create({
      data: {
        merchantId: merchant.id,
        orderId: order.id,
        direction: WhatsAppDirection.OUTBOUND,
        fromNumber: merchant.whatsappFromNumber,
        toNumber,
        status: WhatsAppMessageStatus.FAILED,
        errorMessage,
      },
    }),
  ]);
}
