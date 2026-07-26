ALTER TABLE "PropertyType"
ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'Building2';

UPDATE "PropertyType"
SET "icon" = CASE "value"
    WHEN 'APARTMENT' THEN 'Building2'
    WHEN 'HOUSE' THEN 'House'
    WHEN 'DETACHED_HOUSE' THEN 'House'
    WHEN 'ROW_HOUSE' THEN 'Hotel'
    WHEN 'HOUSE_FLOOR' THEN 'PanelsTopLeft'
    WHEN 'VILLA' THEN 'Castle'
    WHEN 'STUDIO' THEN 'BedDouble'
    WHEN 'CABIN' THEN 'TreePine'
    WHEN 'COTTAGE' THEN 'Tent'
    WHEN 'LOFT' THEN 'Factory'
    WHEN 'OTHER' THEN 'CircleHelp'
    ELSE 'Building2'
END;
