-- One room of a given type and number per listing. Makes the first-open seeding of
-- standard spaces safe to run concurrently: a second request inserts nothing rather than
-- producing a duplicate "Bedroom 1".
CREATE UNIQUE INDEX "ListingRoom_listingId_roomTypeId_ordinal_key"
    ON "ListingRoom"("listingId", "roomTypeId", "ordinal");
