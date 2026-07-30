CREATE TYPE "BookingTimelineEventType" AS ENUM (
  'REQUESTED',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_GUEST',
  'CANCELLED_BY_HOST',
  'CANCELLED_BY_ADMIN',
  'COMPLETED'
);

CREATE TYPE "DamageReportStatus" AS ENUM (
  'REPORTED',
  'ACKNOWLEDGED',
  'ESCALATED',
  'RESOLVED'
);

ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "Message_clientId_key" ON "Message"("clientId");

ALTER TABLE "Notification"
  ADD COLUMN "pushAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pushAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "pushSentAt" TIMESTAMP(3),
  ADD COLUMN "pushLastError" TEXT;

CREATE INDEX "Notification_pushSentAt_pushAvailableAt_idx"
  ON "Notification"("pushSentAt", "pushAvailableAt");

CREATE TABLE "BookingTimelineEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "type" "BookingTimelineEventType" NOT NULL,
  "actorId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingTimelineEvent_idempotencyKey_key"
  ON "BookingTimelineEvent"("idempotencyKey");
CREATE INDEX "BookingTimelineEvent_bookingId_createdAt_idx"
  ON "BookingTimelineEvent"("bookingId", "createdAt");

ALTER TABLE "BookingTimelineEvent"
  ADD CONSTRAINT "BookingTimelineEvent_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingTimelineEvent"
  ADD CONSTRAINT "BookingTimelineEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DamageReport" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "reporterId" TEXT,
  "description" TEXT NOT NULL,
  "status" "DamageReportStatus" NOT NULL DEFAULT 'REPORTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DamageReportEvidence" (
  "id" TEXT NOT NULL,
  "damageReportId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DamageReportEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DamageReport_bookingId_createdAt_idx"
  ON "DamageReport"("bookingId", "createdAt");
CREATE INDEX "DamageReport_conversationId_createdAt_idx"
  ON "DamageReport"("conversationId", "createdAt");
CREATE INDEX "DamageReport_status_createdAt_idx"
  ON "DamageReport"("status", "createdAt");
CREATE INDEX "DamageReportEvidence_damageReportId_idx"
  ON "DamageReportEvidence"("damageReportId");

ALTER TABLE "DamageReport"
  ADD CONSTRAINT "DamageReport_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DamageReport"
  ADD CONSTRAINT "DamageReport_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DamageReport"
  ADD CONSTRAINT "DamageReport_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DamageReportEvidence"
  ADD CONSTRAINT "DamageReportEvidence_damageReportId_fkey"
  FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

WITH inquiry_matches AS (
  SELECT DISTINCT ON (conversation."id")
    conversation."id" AS "conversationId",
    booking."id" AS "bookingId"
  FROM "Conversation" conversation
  JOIN "Booking" booking
    ON booking."listingId" = conversation."listingId"
   AND booking."guestId" = conversation."inquiryGuestId"
  WHERE conversation."bookingId" IS NULL
    AND conversation."inquiryGuestId" IS NOT NULL
  ORDER BY conversation."id", booking."createdAt" ASC
)
UPDATE "Conversation" conversation
SET
  "bookingId" = inquiry_matches."bookingId",
  "inquiryGuestId" = NULL,
  "kind" = 'BOOKING',
  "status" = 'OPEN',
  "updatedAt" = CURRENT_TIMESTAMP
FROM inquiry_matches
WHERE conversation."id" = inquiry_matches."conversationId";

INSERT INTO "Conversation" (
  "id",
  "bookingId",
  "listingId",
  "kind",
  "status",
  "startedById",
  "createdAt",
  "updatedAt"
)
SELECT
  'cv_' || SUBSTRING(MD5(booking."id" || ':conversation') FROM 1 FOR 22),
  booking."id",
  booking."listingId",
  'BOOKING',
  'OPEN',
  booking."guestId",
  booking."createdAt",
  booking."createdAt"
FROM "Booking" booking
LEFT JOIN "Conversation" conversation ON conversation."bookingId" = booking."id"
WHERE conversation."id" IS NULL
ON CONFLICT ("bookingId") DO NOTHING;

INSERT INTO "ConversationParticipant" (
  "conversationId",
  "userId",
  "role",
  "unreadCount",
  "joinedAt"
)
SELECT conversation."id", booking."guestId", 'MEMBER', 0, conversation."createdAt"
FROM "Conversation" conversation
JOIN "Booking" booking ON booking."id" = conversation."bookingId"
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO "ConversationParticipant" (
  "conversationId",
  "userId",
  "role",
  "unreadCount",
  "joinedAt"
)
SELECT conversation."id", listing."hostId", 'MEMBER', 0, conversation."createdAt"
FROM "Conversation" conversation
JOIN "Booking" booking ON booking."id" = conversation."bookingId"
JOIN "Listing" listing ON listing."id" = booking."listingId"
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO "BookingTimelineEvent" (
  "id",
  "bookingId",
  "type",
  "idempotencyKey",
  "createdAt"
)
SELECT
  'bt_' || SUBSTRING(MD5("id" || ':requested') FROM 1 FOR 22),
  "id",
  'REQUESTED'::"BookingTimelineEventType",
  'booking:' || "id" || ':requested',
  "createdAt"
FROM "Booking"
ON CONFLICT ("idempotencyKey") DO NOTHING;

INSERT INTO "BookingTimelineEvent" (
  "id",
  "bookingId",
  "type",
  "idempotencyKey",
  "createdAt"
)
SELECT
  'bt_' || SUBSTRING(MD5("id" || ':' || LOWER("status"::TEXT)) FROM 1 FOR 22),
  "id",
  "status"::TEXT::"BookingTimelineEventType",
  'booking:' || "id" || ':' || LOWER("status"::TEXT),
  COALESCE("respondedAt", "updatedAt")
FROM "Booking"
WHERE "status" <> 'PENDING'
ON CONFLICT ("idempotencyKey") DO NOTHING;
