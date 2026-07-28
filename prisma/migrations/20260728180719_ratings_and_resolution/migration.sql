-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('GUEST_TO_HOST', 'HOST_TO_GUEST');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_ADMIN', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReviewRatingCategory" AS ENUM ('OVERALL', 'ACCURACY', 'CHECK_IN', 'CLEANLINESS', 'COMMUNICATION', 'LOCATION', 'VALUE', 'HOUSE_RULES');

-- CreateEnum
CREATE TYPE "ReviewReminderStage" AS ENUM ('INVITATION', 'DAY_3', 'DAY_7', 'HOURS_48', 'HOURS_24', 'OTHER_PARTY_SUBMITTED');

-- CreateEnum
CREATE TYPE "ClaimKind" AS ENUM ('EXPENSE', 'DAMAGE', 'REFUND');

-- CreateEnum
CREATE TYPE "ClaimResponseStatus" AS ENUM ('AWAITING_ADMIN', 'AWAITING_RECIPIENT', 'ACCEPTED', 'COUNTERED', 'REJECTED', 'ESCALATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_INVITATION';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_REJECTED';

-- AlterTable
ALTER TABLE "SafetyCase" ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "claimKind" "ClaimKind",
ADD COLUMN     "counterAmount" DECIMAL(10,2),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "requestedAmount" DECIMAL(10,2),
ADD COLUMN     "respondBy" TIMESTAMP(3),
ADD COLUMN     "responseNote" TEXT,
ADD COLUMN     "responseStatus" "ClaimResponseStatus";

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "authorId" TEXT,
    "subjectUserId" TEXT,
    "direction" "ReviewDirection" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING_ADMIN',
    "publicComment" TEXT NOT NULL,
    "privateNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewDeadline" TIMESTAMP(3) NOT NULL,
    "adminReadAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "moderationNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRating" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "category" "ReviewRatingCategory" NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "ReviewRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewInvitation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewInvitationReminder" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "stage" "ReviewReminderStage" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewInvitationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAdminRead" (
    "reviewId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAdminRead_pkey" PRIMARY KEY ("reviewId","adminId")
);

-- CreateIndex
CREATE INDEX "Review_listingId_status_publishedAt_idx" ON "Review"("listingId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Review_subjectUserId_status_publishedAt_idx" ON "Review"("subjectUserId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Review_status_submittedAt_idx" ON "Review"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_direction_key" ON "Review"("bookingId", "direction");

-- CreateIndex
CREATE INDEX "ReviewRating_category_score_idx" ON "ReviewRating"("category", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRating_reviewId_category_key" ON "ReviewRating"("reviewId", "category");

-- CreateIndex
CREATE INDEX "ReviewInvitation_recipientId_deadline_idx" ON "ReviewInvitation"("recipientId", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewInvitation_bookingId_direction_key" ON "ReviewInvitation"("bookingId", "direction");

-- CreateIndex
CREATE INDEX "ReviewInvitationReminder_sentAt_idx" ON "ReviewInvitationReminder"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewInvitationReminder_invitationId_stage_key" ON "ReviewInvitationReminder"("invitationId", "stage");

-- CreateIndex
CREATE INDEX "ReviewAdminRead_adminId_readAt_idx" ON "ReviewAdminRead"("adminId", "readAt");

-- CreateIndex
CREATE INDEX "SafetyCase_responseStatus_respondBy_idx" ON "SafetyCase"("responseStatus", "respondBy");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRating" ADD CONSTRAINT "ReviewRating_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ratings and monetary requests are constrained at the database boundary as well as
-- in the application service so malformed direct writes cannot corrupt aggregates.
ALTER TABLE "ReviewRating" ADD CONSTRAINT "ReviewRating_score_check" CHECK ("score" BETWEEN 1 AND 5);
ALTER TABLE "SafetyCase" ADD CONSTRAINT "SafetyCase_requestedAmount_check" CHECK ("requestedAmount" IS NULL OR "requestedAmount" > 0);
ALTER TABLE "SafetyCase" ADD CONSTRAINT "SafetyCase_counterAmount_check" CHECK ("counterAmount" IS NULL OR "counterAmount" > 0);

-- AddForeignKey
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewInvitation" ADD CONSTRAINT "ReviewInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewInvitationReminder" ADD CONSTRAINT "ReviewInvitationReminder_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ReviewInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAdminRead" ADD CONSTRAINT "ReviewAdminRead_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAdminRead" ADD CONSTRAINT "ReviewAdminRead_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
