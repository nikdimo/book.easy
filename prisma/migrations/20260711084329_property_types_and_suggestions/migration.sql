-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('PROPERTY_TYPE', 'AMENITY');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SuggestionScope" AS ENUM ('GLOBAL', 'LISTING_ONLY');

-- AlterTable
ALTER TABLE "Amenity" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: convert the enum column to text, preserving existing values (the enum's
-- member names are valid text and match the `value` codes seeded below). Must happen
-- before dropping the enum type, since the column still depends on it.
ALTER TABLE "Property" ALTER COLUMN "propertyType" TYPE TEXT USING "propertyType"::text;

-- DropEnum: frees up the "PropertyType" name — Postgres shares the type namespace
-- between enums and tables, so the table below can't be created until this runs.
DROP TYPE "PropertyType";

-- CreateTable
CREATE TABLE "PropertyType" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyType_pkey" PRIMARY KEY ("id")
);

-- Seed the table with every value the old enum had, before the FK below requires it.
INSERT INTO "PropertyType" ("id", "value", "label", "isActive", "sortOrder") VALUES
    (gen_random_uuid()::text, 'APARTMENT', 'Apartment', true, 0),
    (gen_random_uuid()::text, 'HOUSE', 'House', true, 1),
    (gen_random_uuid()::text, 'DETACHED_HOUSE', 'Detached House', true, 2),
    (gen_random_uuid()::text, 'ROW_HOUSE', 'Row House', true, 3),
    (gen_random_uuid()::text, 'HOUSE_FLOOR', 'Floor of a House', true, 4),
    (gen_random_uuid()::text, 'VILLA', 'Villa', true, 5),
    (gen_random_uuid()::text, 'STUDIO', 'Studio', true, 6),
    (gen_random_uuid()::text, 'CABIN', 'Cabin', true, 7),
    (gen_random_uuid()::text, 'COTTAGE', 'Cottage', true, 8),
    (gen_random_uuid()::text, 'LOFT', 'Loft', true, 9),
    (gen_random_uuid()::text, 'OTHER', 'Other', true, 10);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "scope" "SuggestionScope",
    "listingId" TEXT,
    "hostId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyType_value_key" ON "PropertyType"("value");

-- CreateIndex
CREATE INDEX "PropertyType_isActive_idx" ON "PropertyType"("isActive");

-- CreateIndex
CREATE INDEX "Suggestion_status_idx" ON "Suggestion"("status");

-- CreateIndex
CREATE INDEX "Suggestion_hostId_idx" ON "Suggestion"("hostId");

-- CreateIndex
CREATE INDEX "Amenity_isActive_idx" ON "Amenity"("isActive");

-- CreateIndex
CREATE INDEX "Property_propertyType_idx" ON "Property"("propertyType");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_propertyType_fkey" FOREIGN KEY ("propertyType") REFERENCES "PropertyType"("value") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
