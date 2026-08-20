-- Standard spaces: the rows a listing's rooms rail offers before the host has created
-- anything. Structure only — which types are standard travels in the release snapshot
-- (`npm run rooms:import`) like the rest of the taxonomy.
ALTER TABLE "RoomType" ADD COLUMN "isStandard" BOOLEAN NOT NULL DEFAULT false;
