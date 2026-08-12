-- Preserve the sender's selected language with every message. The recipient's page
-- can then disclose Google translation accurately instead of guessing from text.
ALTER TABLE "Message" ADD COLUMN "sourceLocale" TEXT NOT NULL DEFAULT 'en';
