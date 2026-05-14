-- =============================================================================
-- Per-merchant YouCan status slug overrides.
--
-- YouCan stores ship with `confirmed` / `cancelled` slugs in the general
-- `orders` status context, but merchants can rename them in the seller
-- dashboard ("Confirmé" / "Annulé", "Acceptée" / "Refusée", whatever). The
-- two new columns let each merchant carry their own mapping so the WhatsApp
-- confirm/cancel handler can call PUT /orders/{id}/status/orders with the
-- right slug per store.
--
-- Defaults match the YouCan factory slugs so existing rows pick them up
-- automatically — no backfill required.
-- =============================================================================

ALTER TABLE "Merchant"
  ADD COLUMN "youcanConfirmedSlug" TEXT NOT NULL DEFAULT 'confirmed';

ALTER TABLE "Merchant"
  ADD COLUMN "youcanCancelledSlug" TEXT NOT NULL DEFAULT 'cancelled';
