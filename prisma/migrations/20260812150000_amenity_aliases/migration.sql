CREATE TABLE "AmenityAlias" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "amenityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmenityAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AmenityAlias_provider_normalizedName_key"
  ON "AmenityAlias"("provider", "normalizedName");
CREATE INDEX "AmenityAlias_amenityId_idx" ON "AmenityAlias"("amenityId");
ALTER TABLE "AmenityAlias"
  ADD CONSTRAINT "AmenityAlias_amenityId_fkey"
  FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
