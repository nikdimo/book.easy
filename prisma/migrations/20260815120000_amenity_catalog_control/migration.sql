-- Amenity catalog: admin-owned categories, ordering, icons and translations.
--
-- Data changes here are keyed by amenity name so they land identically on a local
-- database and on production, whose catalogs have drifted apart (production also
-- holds rows created by provider imports). Rows this migration does not know about
-- keep their data and land in the category their old string named.

-- ── Structure ────────────────────────────────────────────────────────────────
CREATE TABLE "AmenityCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmenityCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AmenityCategory_key_key" ON "AmenityCategory"("key");
CREATE UNIQUE INDEX "AmenityCategory_name_key" ON "AmenityCategory"("name");
CREATE INDEX "AmenityCategory_isActive_idx" ON "AmenityCategory"("isActive");

CREATE TABLE "AmenityTranslation" (
    "id" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmenityTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AmenityTranslation_amenityId_locale_key" ON "AmenityTranslation"("amenityId", "locale");
CREATE INDEX "AmenityTranslation_locale_idx" ON "AmenityTranslation"("locale");

CREATE TABLE "AmenityCategoryTranslation" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AmenityCategoryTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AmenityCategoryTranslation_categoryId_locale_key" ON "AmenityCategoryTranslation"("categoryId", "locale");
CREATE INDEX "AmenityCategoryTranslation_locale_idx" ON "AmenityCategoryTranslation"("locale");

ALTER TABLE "Amenity" ADD COLUMN "key" TEXT;
ALTER TABLE "Amenity" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Amenity" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Amenity" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Categories ───────────────────────────────────────────────────────────────
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-essentials' || '20260815120000_amenity_catalog_control'), 'essentials', 'Essentials', 'wifi', 10);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-bathroom' || '20260815120000_amenity_catalog_control'), 'bathroom', 'Bathroom', 'bath', 20);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-bedroom' || '20260815120000_amenity_catalog_control'), 'bedroom', 'Bedroom', 'bed-double', 30);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-kitchen' || '20260815120000_amenity_catalog_control'), 'kitchen', 'Kitchen', 'chef-hat', 40);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-entertainment' || '20260815120000_amenity_catalog_control'), 'entertainment', 'Entertainment', 'tv', 50);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-outdoor' || '20260815120000_amenity_catalog_control'), 'outdoor', 'Outdoor', 'trees', 60);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-views' || '20260815120000_amenity_catalog_control'), 'views', 'Views', 'mountain-snow', 70);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-parking' || '20260815120000_amenity_catalog_control'), 'parking', 'Parking', 'circle-parking', 80);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-family' || '20260815120000_amenity_catalog_control'), 'family', 'Family', 'baby', 90);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-accessibility' || '20260815120000_amenity_catalog_control'), 'accessibility', 'Accessibility', 'accessibility', 100);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-safety' || '20260815120000_amenity_catalog_control'), 'safety', 'Safety', 'shield-check', 110);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-check_in' || '20260815120000_amenity_catalog_control'), 'check_in', 'Check-in', 'key-round', 120);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-services' || '20260815120000_amenity_catalog_control'), 'services', 'Services', 'concierge-bell', 130);
INSERT INTO "AmenityCategory" ("id", "key", "name", "icon", "sortOrder") VALUES (md5('cat-features' || '20260815120000_amenity_catalog_control'), 'features', 'Features', 'sparkles', 140);

-- ── Fold duplicates away before anything is keyed by name ────────────────────
-- Mini fridge -> Refrigerator
UPDATE "ListingAmenity" la SET "amenityId" = t.id
FROM "Amenity" s, "Amenity" t
WHERE la."amenityId" = s.id AND s.name = 'Mini fridge' AND t.name = 'Refrigerator'
  AND NOT EXISTS (
    SELECT 1 FROM "ListingAmenity" existing
    WHERE existing."listingId" = la."listingId" AND existing."amenityId" = t.id
  );
DELETE FROM "ListingAmenity" la USING "Amenity" s
WHERE la."amenityId" = s.id AND s.name = 'Mini fridge';
UPDATE "AmenityAlias" al SET "amenityId" = t.id
FROM "Amenity" s, "Amenity" t
WHERE al."amenityId" = s.id AND s.name = 'Mini fridge' AND t.name = 'Refrigerator'
  AND NOT EXISTS (
    SELECT 1 FROM "AmenityAlias" existing
    WHERE existing.provider = al.provider AND existing."normalizedName" = al."normalizedName"
      AND existing.id <> al.id
  );
-- Keep resolving the old provider label to the survivor on future imports.
INSERT INTO "AmenityAlias" ("id", "provider", "providerName", "normalizedName", "amenityId", "createdAt", "updatedAt")
SELECT md5('alias-Mini fridge' || '20260815120000_amenity_catalog_control'), 'AIRBNB', 'Mini fridge', 'minifridge', t.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Amenity" t WHERE t.name = 'Refrigerator'
ON CONFLICT ("provider", "normalizedName") DO NOTHING;
DELETE FROM "Amenity" WHERE name = 'Mini fridge';

-- ── Renames ──────────────────────────────────────────────────────────────────
UPDATE "Amenity" SET name = 'Towels and toiletries' WHERE name = 'Essentials';

-- ── Stable keys ──────────────────────────────────────────────────────────────
-- Known rows first, so a slug derived below can never take a key this catalog needs.
UPDATE "Amenity" SET "key" = 'wifi' WHERE name = 'Wi-Fi';
UPDATE "Amenity" SET "key" = 'workspace' WHERE name = 'Workspace';
UPDATE "Amenity" SET "key" = 'air_conditioning' WHERE name = 'Air conditioning';
UPDATE "Amenity" SET "key" = 'heating' WHERE name = 'Heating';
UPDATE "Amenity" SET "key" = 'washing_machine' WHERE name = 'Washer';
UPDATE "Amenity" SET "key" = 'clothes_dryer' WHERE name = 'Dryer';
UPDATE "Amenity" SET "key" = 'clothes_iron' WHERE name = 'Iron';
UPDATE "Amenity" SET "key" = 'cleaning_products' WHERE name = 'Cleaning products';
UPDATE "Amenity" SET "key" = 'hair_dryer' WHERE name = 'Hair dryer';
UPDATE "Amenity" SET "key" = 'shampoo' WHERE name = 'Shampoo';
UPDATE "Amenity" SET "key" = 'hot_water' WHERE name = 'Hot water';
UPDATE "Amenity" SET "key" = 'towels_toiletries' WHERE name = 'Towels and toiletries';
UPDATE "Amenity" SET "key" = 'bed_linens' WHERE name = 'Bed linens';
UPDATE "Amenity" SET "key" = 'extra_pillows_blankets' WHERE name = 'Extra pillows and blankets';
UPDATE "Amenity" SET "key" = 'hangers' WHERE name = 'Hangers';
UPDATE "Amenity" SET "key" = 'clothing_storage' WHERE name = 'Clothing storage';
UPDATE "Amenity" SET "key" = 'room_darkening_shades' WHERE name = 'Room-darkening shades';
UPDATE "Amenity" SET "key" = 'kitchen' WHERE name = 'Kitchen';
UPDATE "Amenity" SET "key" = 'cooking_basics' WHERE name = 'Cooking basics';
UPDATE "Amenity" SET "key" = 'dishes_silverware' WHERE name = 'Dishes and silverware';
UPDATE "Amenity" SET "key" = 'wine_glasses' WHERE name = 'Wine glasses';
UPDATE "Amenity" SET "key" = 'refrigerator' WHERE name = 'Refrigerator';
UPDATE "Amenity" SET "key" = 'freezer' WHERE name = 'Freezer';
UPDATE "Amenity" SET "key" = 'oven' WHERE name = 'Oven';
UPDATE "Amenity" SET "key" = 'stove' WHERE name = 'Stove';
UPDATE "Amenity" SET "key" = 'microwave' WHERE name = 'Microwave';
UPDATE "Amenity" SET "key" = 'dishwasher' WHERE name = 'Dishwasher';
UPDATE "Amenity" SET "key" = 'coffee_maker' WHERE name = 'Coffee maker';
UPDATE "Amenity" SET "key" = 'hot_water_kettle' WHERE name = 'Hot water kettle';
UPDATE "Amenity" SET "key" = 'blender' WHERE name = 'Blender';
UPDATE "Amenity" SET "key" = 'television' WHERE name = 'TV';
UPDATE "Amenity" SET "key" = 'books_reading_material' WHERE name = 'Books and reading material';
UPDATE "Amenity" SET "key" = 'balcony' WHERE name = 'Balcony';
UPDATE "Amenity" SET "key" = 'garden' WHERE name = 'Garden';
UPDATE "Amenity" SET "key" = 'bbq_grill' WHERE name = 'BBQ grill';
UPDATE "Amenity" SET "key" = 'swimming_pool' WHERE name = 'Pool';
UPDATE "Amenity" SET "key" = 'hot_tub' WHERE name = 'Hot tub';
UPDATE "Amenity" SET "key" = 'sea_view' WHERE name = 'Sea view';
UPDATE "Amenity" SET "key" = 'lake_view' WHERE name = 'Lake view';
UPDATE "Amenity" SET "key" = 'city_view' WHERE name = 'City view';
UPDATE "Amenity" SET "key" = 'free_parking' WHERE name = 'Free parking';
UPDATE "Amenity" SET "key" = 'pets_allowed' WHERE name = 'Pets allowed';
UPDATE "Amenity" SET "key" = 'smoke_detector' WHERE name = 'Smoke detector';
UPDATE "Amenity" SET "key" = 'fire_extinguisher' WHERE name = 'Fire extinguisher';
UPDATE "Amenity" SET "key" = 'first_aid_kit' WHERE name = 'First aid kit';
UPDATE "Amenity" SET "key" = 'exterior_security_cameras' WHERE name = 'Exterior security cameras on property';
UPDATE "Amenity" SET "key" = 'lock_on_bedroom_door' WHERE name = 'Lock on bedroom door';
UPDATE "Amenity" SET "key" = 'self_check_in' WHERE name = 'Self check-in';
UPDATE "Amenity" SET "key" = 'lockbox' WHERE name = 'Lockbox';
UPDATE "Amenity" SET "key" = 'smart_lock' WHERE name = 'Smart lock';

-- Anything else (provider imports, host suggestions) gets a slug of its name.
-- A slug already claimed above, or shared with another unkeyed row, falls back to
-- a suffixed form: "Air-conditioning" must never take the key belonging to
-- "Air conditioning", or the catalog row would lose its reviewed translations.
UPDATE "Amenity" a
SET "key" = CASE
  WHEN s.rn = 1 AND NOT EXISTS (SELECT 1 FROM "Amenity" b WHERE b."key" = s.slug)
    THEN s.slug
  ELSE s.slug || '_' || substr(md5(a.id), 1, 6)
END
FROM (
  SELECT
    id,
    COALESCE(NULLIF(trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))), ''), 'amenity') AS slug,
    row_number() OVER (
      PARTITION BY COALESCE(NULLIF(trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))), ''), 'amenity')
      ORDER BY "createdAt", id
    ) AS rn
  FROM "Amenity"
  WHERE "key" IS NULL
) s
WHERE a.id = s.id;

-- ── Category assignment ──────────────────────────────────────────────────────
-- Start from the old string so unknown rows keep the grouping they had.
UPDATE "Amenity" a SET "categoryId" = c.id FROM "AmenityCategory" c WHERE c.name = a.category;
UPDATE "Amenity" a SET "categoryId" = c.id
FROM "AmenityCategory" c WHERE c.key = 'features' AND a."categoryId" IS NULL;

-- Then move the known catalog into its real home, with its icon and order.
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'wifi', "sortOrder" = 10 WHERE name = 'Wi-Fi';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'laptop', "sortOrder" = 20 WHERE name = 'Workspace';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'air-vent', "sortOrder" = 30 WHERE name = 'Air conditioning';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'thermometer', "sortOrder" = 40 WHERE name = 'Heating';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'washing-machine', "sortOrder" = 50 WHERE name = 'Washer';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'wind', "sortOrder" = 60 WHERE name = 'Dryer';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'shirt', "sortOrder" = 70 WHERE name = 'Iron';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'essentials'), "icon" = 'spray-can', "sortOrder" = 80 WHERE name = 'Cleaning products';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bathroom'), "icon" = 'wind', "sortOrder" = 10 WHERE name = 'Hair dryer';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bathroom'), "icon" = 'droplet', "sortOrder" = 20 WHERE name = 'Shampoo';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bathroom'), "icon" = 'droplets', "sortOrder" = 30 WHERE name = 'Hot water';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bathroom'), "icon" = 'sparkles', "sortOrder" = 40 WHERE name = 'Towels and toiletries';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bedroom'), "icon" = 'bed-double', "sortOrder" = 10 WHERE name = 'Bed linens';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bedroom'), "icon" = 'bed', "sortOrder" = 20 WHERE name = 'Extra pillows and blankets';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bedroom'), "icon" = 'shirt', "sortOrder" = 30 WHERE name = 'Hangers';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bedroom'), "icon" = 'archive', "sortOrder" = 40 WHERE name = 'Clothing storage';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'bedroom'), "icon" = 'blinds', "sortOrder" = 50 WHERE name = 'Room-darkening shades';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'chef-hat', "sortOrder" = 10 WHERE name = 'Kitchen';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'cooking-pot', "sortOrder" = 20 WHERE name = 'Cooking basics';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'utensils', "sortOrder" = 30 WHERE name = 'Dishes and silverware';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'wine', "sortOrder" = 40 WHERE name = 'Wine glasses';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'refrigerator', "sortOrder" = 50 WHERE name = 'Refrigerator';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'snowflake', "sortOrder" = 60 WHERE name = 'Freezer';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'flame', "sortOrder" = 70 WHERE name = 'Oven';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'soup', "sortOrder" = 80 WHERE name = 'Stove';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'microwave', "sortOrder" = 90 WHERE name = 'Microwave';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'utensils-crossed', "sortOrder" = 100 WHERE name = 'Dishwasher';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'coffee', "sortOrder" = 110 WHERE name = 'Coffee maker';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'cup-soda', "sortOrder" = 120 WHERE name = 'Hot water kettle';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'kitchen'), "icon" = 'blend', "sortOrder" = 130 WHERE name = 'Blender';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'entertainment'), "icon" = 'tv', "sortOrder" = 10 WHERE name = 'TV';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'entertainment'), "icon" = 'book-open', "sortOrder" = 20 WHERE name = 'Books and reading material';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'outdoor'), "icon" = 'sun', "sortOrder" = 10 WHERE name = 'Balcony';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'outdoor'), "icon" = 'trees', "sortOrder" = 30 WHERE name = 'Garden';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'outdoor'), "icon" = 'beef', "sortOrder" = 40 WHERE name = 'BBQ grill';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'outdoor'), "icon" = 'waves', "sortOrder" = 60 WHERE name = 'Pool';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'outdoor'), "icon" = 'bath', "sortOrder" = 70 WHERE name = 'Hot tub';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'views'), "icon" = 'sailboat', "sortOrder" = 10 WHERE name = 'Sea view';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'views'), "icon" = 'ship', "sortOrder" = 20 WHERE name = 'Lake view';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'views'), "icon" = 'building-2', "sortOrder" = 40 WHERE name = 'City view';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'parking'), "icon" = 'circle-parking', "sortOrder" = 10 WHERE name = 'Free parking';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'family'), "icon" = 'paw-print', "sortOrder" = 40 WHERE name = 'Pets allowed';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'safety'), "icon" = 'siren', "sortOrder" = 10 WHERE name = 'Smoke detector';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'safety'), "icon" = 'fire-extinguisher', "sortOrder" = 30 WHERE name = 'Fire extinguisher';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'safety'), "icon" = 'heart-pulse', "sortOrder" = 40 WHERE name = 'First aid kit';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'safety'), "icon" = 'cctv', "sortOrder" = 50 WHERE name = 'Exterior security cameras on property';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'safety'), "icon" = 'lock-keyhole', "sortOrder" = 60 WHERE name = 'Lock on bedroom door';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'check_in'), "icon" = 'key-round', "sortOrder" = 10 WHERE name = 'Self check-in';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'check_in'), "icon" = 'vault', "sortOrder" = 20 WHERE name = 'Lockbox';
UPDATE "Amenity" SET "categoryId" = (SELECT id FROM "AmenityCategory" WHERE "key" = 'check_in'), "icon" = 'lock', "sortOrder" = 30 WHERE name = 'Smart lock';

-- The old free-text column has served its purpose as the fallback mapping above,
-- and it is NOT NULL, so it has to go before any row is inserted without it.
ALTER TABLE "Amenity" DROP COLUMN "category";

-- ── Additions ────────────────────────────────────────────────────────────────
-- Inserted rather than left to the release snapshot so a production database that
-- never receives a local export still ends up with the same catalog.
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-toaster' || '20260815120000_amenity_catalog_control'), 'Toaster', 'toaster', c.id, 'sandwich', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'kitchen'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-dining_table' || '20260815120000_amenity_catalog_control'), 'Dining table', 'dining_table', c.id, 'hand-platter', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'kitchen'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-sound_system' || '20260815120000_amenity_catalog_control'), 'Sound system', 'sound_system', c.id, 'speaker', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'entertainment'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-board_games' || '20260815120000_amenity_catalog_control'), 'Board games', 'board_games', c.id, 'puzzle', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'entertainment'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-terrace' || '20260815120000_amenity_catalog_control'), 'Terrace', 'terrace', c.id, 'umbrella', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'outdoor'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-outdoor_furniture' || '20260815120000_amenity_catalog_control'), 'Outdoor furniture', 'outdoor_furniture', c.id, 'armchair', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'outdoor'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-sauna' || '20260815120000_amenity_catalog_control'), 'Sauna', 'sauna', c.id, 'heater', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'outdoor'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-fire_pit' || '20260815120000_amenity_catalog_control'), 'Fire pit', 'fire_pit', c.id, 'flame', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'outdoor'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-bike_storage' || '20260815120000_amenity_catalog_control'), 'Bike storage', 'bike_storage', c.id, 'bike', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'outdoor'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-mountain_view' || '20260815120000_amenity_catalog_control'), 'Mountain view', 'mountain_view', c.id, 'mountain-snow', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'views'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-waterfront_access' || '20260815120000_amenity_catalog_control'), 'Lake or sea access', 'waterfront_access', c.id, 'anchor', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'views'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-free_street_parking' || '20260815120000_amenity_catalog_control'), 'Free street parking', 'free_street_parking', c.id, 'car', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'parking'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-paid_parking' || '20260815120000_amenity_catalog_control'), 'Paid parking', 'paid_parking', c.id, 'parking-meter', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'parking'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-ev_charger' || '20260815120000_amenity_catalog_control'), 'EV charger', 'ev_charger', c.id, 'plug-zap', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'parking'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-crib' || '20260815120000_amenity_catalog_control'), 'Crib', 'crib', c.id, 'bed-single', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'family'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-high_chair' || '20260815120000_amenity_catalog_control'), 'High chair', 'high_chair', c.id, 'baby', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'family'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-childrens_books_toys' || '20260815120000_amenity_catalog_control'), 'Children''s books and toys', 'childrens_books_toys', c.id, 'toy-brick', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'family'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-elevator' || '20260815120000_amenity_catalog_control'), 'Elevator', 'elevator', c.id, 'arrow-up-down', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'accessibility'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-step_free_entrance' || '20260815120000_amenity_catalog_control'), 'Step-free entrance', 'step_free_entrance', c.id, 'accessibility', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'accessibility'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-ground_floor' || '20260815120000_amenity_catalog_control'), 'Ground floor', 'ground_floor', c.id, 'house', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'accessibility'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-carbon_monoxide_alarm' || '20260815120000_amenity_catalog_control'), 'Carbon monoxide alarm', 'carbon_monoxide_alarm', c.id, 'circle-alert', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'safety'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-host_greets_you' || '20260815120000_amenity_catalog_control'), 'Host greets you', 'host_greets_you', c.id, 'concierge-bell', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'check_in'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-luggage_dropoff' || '20260815120000_amenity_catalog_control'), 'Luggage drop-off allowed', 'luggage_dropoff', c.id, 'luggage', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'check_in'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-long_term_stays' || '20260815120000_amenity_catalog_control'), 'Long-term stays allowed', 'long_term_stays', c.id, 'calendar-days', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'services'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-cleaning_during_stay' || '20260815120000_amenity_catalog_control'), 'Cleaning available during stay', 'cleaning_during_stay', c.id, 'brush', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'services'
ON CONFLICT (name) DO NOTHING;
INSERT INTO "Amenity" ("id", "name", "key", "categoryId", "icon", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT md5('am-breakfast' || '20260815120000_amenity_catalog_control'), 'Breakfast', 'breakfast', c.id, 'croissant', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AmenityCategory" c WHERE c."key" = 'services'
ON CONFLICT (name) DO NOTHING;

-- ── Constraints ──────────────────────────────────────────────────────────────
ALTER TABLE "Amenity" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "Amenity" ALTER COLUMN "categoryId" SET NOT NULL;
CREATE UNIQUE INDEX "Amenity_key_key" ON "Amenity"("key");
CREATE INDEX "Amenity_categoryId_idx" ON "Amenity"("categoryId");
ALTER TABLE "Amenity" ADD CONSTRAINT "Amenity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AmenityCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmenityTranslation" ADD CONSTRAINT "AmenityTranslation_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmenityTranslation" ADD CONSTRAINT "AmenityTranslation_locale_fkey" FOREIGN KEY ("locale") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmenityCategoryTranslation" ADD CONSTRAINT "AmenityCategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AmenityCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmenityCategoryTranslation" ADD CONSTRAINT "AmenityCategoryTranslation_locale_fkey" FOREIGN KEY ("locale") REFERENCES "Language"("code") ON DELETE CASCADE ON UPDATE CASCADE;
