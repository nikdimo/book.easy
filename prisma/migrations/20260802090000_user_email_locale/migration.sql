-- Nullable with no default: NULL means "never chose a language", which the email
-- layer reads as English. Adding a nullable column takes no table rewrite, so this
-- is safe to apply to a live User table.
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
