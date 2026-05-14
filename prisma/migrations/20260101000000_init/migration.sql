-- =============================================================================
-- Baseline migration. Captures the schema as it shipped on the Shopify branch,
-- so production databases that pre-date Prisma Migrate can be marked as
-- already-applied with:
--
--   npx prisma migrate resolve --applied 20260101000000_init
--
-- For a green-field install, this runs first and 20260514000000_youcan_rename
-- runs on top.
-- =============================================================================

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "shopifyDomain" TEXT NOT NULL,
    "shopifyAccessToken" TEXT NOT NULL,
    "shopifyWebhookSecret" TEXT NOT NULL,
    "whatsappFromNumber" TEXT NOT NULL,
    "whatsappTemplateSid" TEXT,
    "defaultCountryCode" TEXT NOT NULL DEFAULT 'DZ',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "lineItemsSummary" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmationSentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "shopifyUpdatedAt" TIMESTAMP(3),
    "rawShopifyPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "orderId" TEXT,
    "direction" "WhatsAppDirection" NOT NULL,
    "providerMessageId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "body" TEXT,
    "buttonPayload" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL,
    "errorMessage" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_shopifyDomain_key" ON "Merchant"("shopifyDomain");

-- CreateIndex
CREATE INDEX "Merchant_shopifyDomain_idx" ON "Merchant"("shopifyDomain");

-- CreateIndex
CREATE INDEX "Order_merchantId_customerPhone_status_idx" ON "Order"("merchantId", "customerPhone", "status");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_merchantId_shopifyOrderId_key" ON "Order"("merchantId", "shopifyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppLog_providerMessageId_key" ON "WhatsAppLog"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppLog_merchantId_createdAt_idx" ON "WhatsAppLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppLog_orderId_idx" ON "WhatsAppLog"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLog" ADD CONSTRAINT "WhatsAppLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
