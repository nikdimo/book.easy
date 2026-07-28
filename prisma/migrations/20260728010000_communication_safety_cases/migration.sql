-- Extend booking chat into pre-booking inquiries and visible support participation.
CREATE TYPE "ConversationKind" AS ENUM ('INQUIRY', 'BOOKING');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'FROZEN', 'CLOSED');
CREATE TYPE "ConversationParticipantRole" AS ENUM ('MEMBER', 'SUPPORT');
CREATE TYPE "SafetyCaseType" AS ENUM ('REPORT', 'CLAIM');
CREATE TYPE "SafetyCaseStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'AWAITING_INFORMATION', 'RESOLVED', 'REJECTED');
CREATE TYPE "SafetyCasePriority" AS ENUM ('NORMAL', 'URGENT');
CREATE TYPE "SafetyCaseTargetType" AS ENUM ('USER', 'HOST', 'LISTING', 'BOOKING', 'MESSAGE');

ALTER TYPE "NotificationType" ADD VALUE 'CASE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'CASE_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_MESSAGE';

ALTER TABLE "Conversation"
  ADD COLUMN "kind" "ConversationKind" NOT NULL DEFAULT 'BOOKING',
  ADD COLUMN "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "startedById" TEXT,
  ADD COLUMN "inquiryGuestId" TEXT,
  ADD COLUMN "supportJoinedAt" TIMESTAMP(3);

ALTER TABLE "ConversationParticipant"
  ADD COLUMN "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER';

CREATE UNIQUE INDEX "Conversation_listingId_inquiryGuestId_key"
  ON "Conversation"("listingId", "inquiryGuestId");
CREATE INDEX "Conversation_kind_status_idx" ON "Conversation"("kind", "status");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_startedById_fkey"
  FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversation_inquiryGuestId_fkey"
  FOREIGN KEY ("inquiryGuestId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SafetyCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "type" "SafetyCaseType" NOT NULL,
  "status" "SafetyCaseStatus" NOT NULL DEFAULT 'SUBMITTED',
  "priority" "SafetyCasePriority" NOT NULL DEFAULT 'NORMAL',
  "targetType" "SafetyCaseTargetType" NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reportedUserId" TEXT,
  "listingId" TEXT,
  "bookingId" TEXT,
  "messageId" TEXT,
  "conversationId" TEXT,
  "assignedAdminId" TEXT,
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SafetyCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SafetyCaseEvidence" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SafetyCaseEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SafetyCaseUpdate" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SafetyCaseUpdate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SafetyCase_reference_key" ON "SafetyCase"("reference");
CREATE INDEX "SafetyCase_reporterId_createdAt_idx" ON "SafetyCase"("reporterId", "createdAt");
CREATE INDEX "SafetyCase_status_priority_createdAt_idx" ON "SafetyCase"("status", "priority", "createdAt");
CREATE INDEX "SafetyCase_assignedAdminId_status_idx" ON "SafetyCase"("assignedAdminId", "status");
CREATE INDEX "SafetyCase_listingId_idx" ON "SafetyCase"("listingId");
CREATE INDEX "SafetyCase_bookingId_idx" ON "SafetyCase"("bookingId");
CREATE INDEX "SafetyCase_reportedUserId_idx" ON "SafetyCase"("reportedUserId");
CREATE INDEX "SafetyCaseEvidence_caseId_idx" ON "SafetyCaseEvidence"("caseId");
CREATE INDEX "SafetyCaseUpdate_caseId_createdAt_idx" ON "SafetyCaseUpdate"("caseId", "createdAt");

ALTER TABLE "SafetyCase"
  ADD CONSTRAINT "SafetyCase_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_reportedUserId_fkey"
  FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCase_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SafetyCaseEvidence"
  ADD CONSTRAINT "SafetyCaseEvidence_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "SafetyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SafetyCaseUpdate"
  ADD CONSTRAINT "SafetyCaseUpdate_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "SafetyCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SafetyCaseUpdate_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
