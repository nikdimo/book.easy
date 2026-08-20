-- Rooms and spaces: an admin-owned taxonomy of room types, the rooms a listing has,
-- and the link from a photo to the room it belongs to.
--
-- Structure only. The catalog rows themselves arrive through the release snapshot
-- (`npm run rooms:import`), exactly like the amenity catalog, so a room type added in
-- Settings locally reaches production on the next deploy without a migration.

-- ── Room type taxonomy ──────────────────────────────────────────────────────────
CREATE TABLE "RoomTypeCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomTypeCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomTypeCategory_key_key" ON "RoomTypeCategory"("key");
CREATE UNIQUE INDEX "RoomTypeCategory_name_key" ON "RoomTypeCategory"("name");
CREATE INDEX "RoomTypeCategory_isActive_idx" ON "RoomTypeCategory"("isActive");

CREATE TABLE "RoomType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRepeatable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomType_name_key" ON "RoomType"("name");
CREATE UNIQUE INDEX "RoomType_key_key" ON "RoomType"("key");
CREATE INDEX "RoomType_isActive_idx" ON "RoomType"("isActive");
CREATE INDEX "RoomType_categoryId_idx" ON "RoomType"("categoryId");

ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "RoomTypeCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Translations ────────────────────────────────────────────────────────────────
CREATE TABLE "RoomTypeTranslation" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomTypeTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomTypeTranslation_roomTypeId_locale_key" ON "RoomTypeTranslation"("roomTypeId", "locale");
CREATE INDEX "RoomTypeTranslation_locale_idx" ON "RoomTypeTranslation"("locale");

ALTER TABLE "RoomTypeTranslation" ADD CONSTRAINT "RoomTypeTranslation_roomTypeId_fkey"
    FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTypeTranslation" ADD CONSTRAINT "RoomTypeTranslation_locale_fkey"
    FOREIGN KEY ("locale") REFERENCES "Language"("code")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RoomTypeCategoryTranslation" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomTypeCategoryTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoomTypeCategoryTranslation_categoryId_locale_key" ON "RoomTypeCategoryTranslation"("categoryId", "locale");
CREATE INDEX "RoomTypeCategoryTranslation_locale_idx" ON "RoomTypeCategoryTranslation"("locale");

ALTER TABLE "RoomTypeCategoryTranslation" ADD CONSTRAINT "RoomTypeCategoryTranslation_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "RoomTypeCategory"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomTypeCategoryTranslation" ADD CONSTRAINT "RoomTypeCategoryTranslation_locale_fkey"
    FOREIGN KEY ("locale") REFERENCES "Language"("code")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Rooms on a listing ──────────────────────────────────────────────────────────
CREATE TABLE "ListingRoom" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 1,
    "displayName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ListingRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ListingRoom_listingId_idx" ON "ListingRoom"("listingId");
CREATE INDEX "ListingRoom_roomTypeId_idx" ON "ListingRoom"("roomTypeId");

ALTER TABLE "ListingRoom" ADD CONSTRAINT "ListingRoom_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingRoom" ADD CONSTRAINT "ListingRoom_roomTypeId_fkey"
    FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Photo to room ───────────────────────────────────────────────────────────────
-- ON DELETE SET NULL is the whole contract of "deleting a room keeps its photos":
-- the rows fall back to Other / Unassigned instead of disappearing with the room.
ALTER TABLE "ListingImage" ADD COLUMN "roomId" TEXT;
ALTER TABLE "ListingImage" ADD COLUMN "roomOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ListingImage_roomId_idx" ON "ListingImage"("roomId");

ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ListingRoom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
