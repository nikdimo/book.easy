-- AlterTable
ALTER TABLE "Language" ADD COLUMN     "lastSelectedAt" TIMESTAMP(3),
ADD COLUMN     "selectionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "useAiTranslation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UiString" (
    "key" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "filePath" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UiString_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UiTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceTextSnapshot" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UiTranslation_locale_idx" ON "UiTranslation"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "UiTranslation_locale_key_key" ON "UiTranslation"("locale", "key");
