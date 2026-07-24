-- CreateTable
CREATE TABLE "TranslationSyncLock" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationSyncLock_pkey" PRIMARY KEY ("id")
);
