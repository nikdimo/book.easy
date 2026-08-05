-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "displayCurrency" TEXT,
ADD COLUMN     "displayRate" DECIMAL(20,10),
ADD COLUMN     "displayTotal" DECIMAL(14,2),
ALTER COLUMN "responseDueAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayCurrency" TEXT;

-- CreateTable
CREATE TABLE "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "base" TEXT NOT NULL DEFAULT 'EUR',
    "rates" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRateSnapshot_pkey" PRIMARY KEY ("id")
);
