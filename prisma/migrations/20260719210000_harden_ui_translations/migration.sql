-- Preserve historical translations while allowing extraction to mark removed UI
-- strings inactive. This avoids destructive deletion when a deployment contains a
-- temporarily incomplete source tree or an extractor regression.
ALTER TABLE "UiString"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UiTranslation"
ADD COLUMN "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "UiString_isActive_idx" ON "UiString"("isActive");

-- Remove any legacy orphan rows before adding referential integrity. Re-adding a
-- language later will create fresh translations through the normal sync workflow.
DELETE FROM "UiTranslation" AS translation
WHERE NOT EXISTS (
  SELECT 1 FROM "Language" AS language WHERE language."code" = translation."locale"
)
OR NOT EXISTS (
  SELECT 1 FROM "UiString" AS ui_string WHERE ui_string."key" = translation."key"
);

ALTER TABLE "UiTranslation"
ADD CONSTRAINT "UiTranslation_locale_fkey"
FOREIGN KEY ("locale") REFERENCES "Language"("code")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UiTranslation"
ADD CONSTRAINT "UiTranslation_key_fkey"
FOREIGN KEY ("key") REFERENCES "UiString"("key")
ON DELETE CASCADE ON UPDATE CASCADE;
