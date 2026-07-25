ALTER TABLE "Property"
ADD COLUMN "locationSource" TEXT,
ADD COLUMN "geocodingProvider" TEXT,
ADD COLUMN "geocodingPlaceId" TEXT,
ADD COLUMN "geocodingConfidence" DOUBLE PRECISION;
