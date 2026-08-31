-- Saved Facebook groups a host promotes their properties into.
--
-- A new table only: nothing existing is altered, so this applies to a live database
-- without a rewrite, a backfill, or a lock held past the catalog update.
--
-- Host-scoped rather than listing-scoped. The same three local rental groups get used
-- for every property a host owns, and a listing-level list would make them retype the
-- URLs for each new listing.
--
-- The unique index is on the *normalized* URL (see lib/facebook-destinations.ts): the
-- application canonicalizes `m.facebook.com`, `web.facebook.com`, trailing slashes,
-- tracking query parameters and fragments to one `https://www.facebook.com/groups/<id>`
-- form before writing, so the constraint actually catches the same group saved twice.
-- It is scoped by host, because two hosts saving the same public group is normal.
--
-- ON DELETE CASCADE: these rows are a host's own bookmarks. They carry no marketplace
-- history worth preserving past the account, unlike the booking and listing foreign
-- keys that are deliberately RESTRICT.
CREATE TABLE "HostFacebookDestination" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostFacebookDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HostFacebookDestination_hostId_url_key" ON "HostFacebookDestination"("hostId", "url");

-- Matches the picker's ordering: a host's own rows, favourites first, then whichever
-- group they most recently opened.
CREATE INDEX "HostFacebookDestination_hostId_favorite_lastUsedAt_idx" ON "HostFacebookDestination"("hostId", "favorite", "lastUsedAt");

ALTER TABLE "HostFacebookDestination" ADD CONSTRAINT "HostFacebookDestination_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
