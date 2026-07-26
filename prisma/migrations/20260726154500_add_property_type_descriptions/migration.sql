ALTER TABLE "PropertyType"
ADD COLUMN "description" TEXT NOT NULL DEFAULT 'A distinct type of accommodation available for guests to book.';

UPDATE "PropertyType"
SET "description" = CASE "value"
    WHEN 'APARTMENT' THEN 'A private, self-contained home within a larger residential building.'
    WHEN 'HOUSE' THEN 'An entire residential building that guests have to themselves.'
    WHEN 'DETACHED_HOUSE' THEN 'A standalone house that does not share walls with neighboring homes.'
    WHEN 'ROW_HOUSE' THEN 'A house joined to neighboring houses by one or both side walls.'
    WHEN 'HOUSE_FLOOR' THEN 'A private floor or level within a larger house.'
    WHEN 'VILLA' THEN 'A spacious standalone home, often with private outdoor space or premium amenities.'
    WHEN 'STUDIO' THEN 'A compact open-plan home where living and sleeping areas share one main room.'
    WHEN 'CABIN' THEN 'A small, usually rustic home in a natural or rural setting.'
    WHEN 'COTTAGE' THEN 'A cozy traditional home, usually in the countryside or close to nature.'
    WHEN 'LOFT' THEN 'An open-plan space, often with high ceilings or converted industrial features.'
    WHEN 'OTHER' THEN 'Accommodation that does not fit one of the standard property categories.'
    ELSE 'A distinct type of accommodation available for guests to book.'
END;
