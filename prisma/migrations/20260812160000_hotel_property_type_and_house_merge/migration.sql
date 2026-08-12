-- "House" and "Detached House" were never a choice a host could make confidently: the
-- seeded descriptions differed only by whether the building shares a wall, and
-- "Row House" already covers the joined case. Merge them rather than soft-hiding the
-- duplicate — isActive = false would keep it on every listing that already picked it,
-- which is exactly the split we're trying to remove.
--
-- Order matters: repoint the properties first so nothing references the row by the
-- time it is deleted (Property.propertyType is a RESTRICT foreign key).
UPDATE "Property" SET "propertyType" = 'HOUSE' WHERE "propertyType" = 'DETACHED_HOUSE';

DELETE FROM "PropertyType" WHERE "value" = 'DETACHED_HOUSE';

-- Absorb the standalone meaning into House, so the merged type still answers the
-- question the deleted one was there to answer.
UPDATE "PropertyType"
SET "description" = 'An entire house that guests have to themselves, standing on its own.'
WHERE "value" = 'HOUSE';

INSERT INTO "PropertyType" ("id", "value", "label", "icon", "description", "isActive", "sortOrder")
VALUES (
    gen_random_uuid()::text,
    'HOTEL',
    'Hotel',
    'Hotel',
    'A hotel, guesthouse, or similar property where guests book individual rooms.',
    true,
    9
)
ON CONFLICT ("value") DO NOTHING;

-- Row House held the Lucide "Hotel" glyph, which now collides with the type that
-- actually is a hotel.
UPDATE "PropertyType" SET "icon" = 'Warehouse' WHERE "value" = 'ROW_HOUSE';

-- Close the gap the deleted row left and give Hotel a settled place near the end,
-- next to the other types a guest browses last.
UPDATE "PropertyType"
SET "sortOrder" = CASE "value"
    WHEN 'APARTMENT' THEN 0
    WHEN 'HOUSE' THEN 1
    WHEN 'ROW_HOUSE' THEN 2
    WHEN 'HOUSE_FLOOR' THEN 3
    WHEN 'VILLA' THEN 4
    WHEN 'STUDIO' THEN 5
    WHEN 'LOFT' THEN 6
    WHEN 'CABIN' THEN 7
    WHEN 'COTTAGE' THEN 8
    WHEN 'HOTEL' THEN 9
    WHEN 'OTHER' THEN 10
    ELSE "sortOrder"
END
WHERE "value" IN (
    'APARTMENT', 'HOUSE', 'ROW_HOUSE', 'HOUSE_FLOOR', 'VILLA',
    'STUDIO', 'LOFT', 'CABIN', 'COTTAGE', 'HOTEL', 'OTHER'
);
