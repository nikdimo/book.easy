-- How a host last set the promotion wizard up, so it opens on their answers instead of
-- an empty form.
--
-- A new table only: nothing existing is altered, so this applies to a live database
-- without a rewrite, a backfill, or a lock held past the catalog update.
--
-- Keyed by host rather than given a surrogate id. There is exactly one of these per
-- host and it is always read by host, so the primary key is the lookup, and an upsert
-- has nothing to disambiguate.
--
-- No index beyond the primary key: nothing queries this table by anything else, and
-- nothing lists it.
--
-- ON DELETE CASCADE, like the saved-groups table beside it: this is a host's own
-- convenience state and carries no marketplace history worth outliving the account.
CREATE TABLE "HostPromotionPreference" (
    "hostId" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeProfile" BOOLEAN NOT NULL DEFAULT true,
    "destinationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeGuests" BOOLEAN NOT NULL DEFAULT true,
    "includePrice" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostPromotionPreference_pkey" PRIMARY KEY ("hostId")
);

ALTER TABLE "HostPromotionPreference" ADD CONSTRAINT "HostPromotionPreference_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
