-- CreateTable
CREATE TABLE "MarketplaceSettings" (
    "id" TEXT NOT NULL,
    "featuredMarketEnabled" BOOLEAN NOT NULL DEFAULT false,
    "featuredCity" TEXT,
    "featuredCountry" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSettings_pkey" PRIMARY KEY ("id")
);
