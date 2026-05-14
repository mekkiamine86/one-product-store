-- =============================================================================
-- Make youcanStoreSlug a nullable display field; add youcanStoreId.
--
-- Background: the OAuth callback populated `youcanStoreSlug` with a synthetic
-- "pending-<uuid>.youcan.shop" placeholder because YouCan exposes no
-- documented "/me" endpoint to discover the real store identity. The
-- placeholder isn't useful to operators and the UNIQUE constraint on a
-- random-uuid column has no semantic value.
--
-- This migration:
--   - clears those placeholders so the dashboard shows a real "(unset)"
--     state instead of an ugly random string,
--   - drops the UNIQUE constraint and the matching index,
--   - makes `youcanStoreSlug` nullable,
--   - adds nullable `youcanStoreId` for opportunistic capture from the
--     first order.create payload that carries a platform store id.
-- =============================================================================

-- 1. Drop the UNIQUE constraint and the duplicate b-tree index so we can
--    NULL out the placeholder rows in step 3 without violating the
--    constraint.
DROP INDEX "Merchant_youcanStoreSlug_key";
DROP INDEX "Merchant_youcanStoreSlug_idx";

-- 2. Allow NULL.
ALTER TABLE "Merchant" ALTER COLUMN "youcanStoreSlug" DROP NOT NULL;

-- 3. Wipe synthetic placeholders so the dashboard shows a real "(unset)"
--    state. Pattern is narrow enough that no real merchant slug can match.
UPDATE "Merchant"
SET "youcanStoreSlug" = NULL
WHERE "youcanStoreSlug" LIKE 'pending-%.youcan.shop';

-- 4. Add the platform store id column + a non-unique index so the dashboard
--    can group/filter by it once populated.
ALTER TABLE "Merchant" ADD COLUMN "youcanStoreId" TEXT;
CREATE INDEX "Merchant_youcanStoreId_idx" ON "Merchant"("youcanStoreId");
