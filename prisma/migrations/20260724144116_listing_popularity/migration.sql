-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "popularityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "popularityUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ListingView" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "viewedOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingView_listingId_viewedOn_idx" ON "ListingView"("listingId", "viewedOn");

-- CreateIndex
CREATE INDEX "ListingView_viewedOn_idx" ON "ListingView"("viewedOn");

-- CreateIndex
CREATE UNIQUE INDEX "ListingView_listingId_visitorKey_viewedOn_key" ON "ListingView"("listingId", "visitorKey", "viewedOn");

-- CreateIndex
CREATE INDEX "Listing_status_popularityScore_idx" ON "Listing"("status", "popularityScore");

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
