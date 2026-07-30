CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'PUSH');
CREATE TYPE "MarketingAudience" AS ENUM ('GUEST', 'HOST');
CREATE TYPE "MarketingPreferenceStatus" AS ENUM ('NOT_SUBSCRIBED', 'PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED');
CREATE TYPE "MarketingConsentAction" AS ENUM ('REQUESTED', 'CONFIRMED', 'WITHDRAWN', 'SUPPRESSED');
CREATE TYPE "MarketingSuppressionReason" AS ENUM ('UNSUBSCRIBE', 'COMPLAINT', 'HARD_BOUNCE', 'MANUAL', 'PRIVACY_OBJECTION');
CREATE TYPE "MarketingTokenPurpose" AS ENUM ('CONFIRM_EMAIL', 'UNSUBSCRIBE_EMAIL');
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MarketingDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');

CREATE TABLE "CommunicationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageEmail" BOOLEAN NOT NULL DEFAULT true,
    "reviewEmail" BOOLEAN NOT NULL DEFAULT true,
    "operationalPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsentStatement" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "legalEntity" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "audience" "MarketingAudience" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "contentHash" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "ConsentStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingPreference" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "audience" "MarketingAudience" NOT NULL,
    "status" "MarketingPreferenceStatus" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "statementId" TEXT,
    "requestedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingConsentEvent" (
    "id" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "statementId" TEXT,
    "action" "MarketingConsentAction" NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingSuppression" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "reason" "MarketingSuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingSuppression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingToken" (
    "id" TEXT NOT NULL,
    "preferenceId" TEXT NOT NULL,
    "purpose" "MarketingTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "audience" "MarketingAudience" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "preferenceId" TEXT,
    "status" "MarketingDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunicationPreference_userId_key" ON "CommunicationPreference"("userId");
CREATE UNIQUE INDEX "MarketingContact_userId_key" ON "MarketingContact"("userId");
CREATE UNIQUE INDEX "MarketingContact_email_key" ON "MarketingContact"("email");
CREATE INDEX "MarketingContact_createdAt_idx" ON "MarketingContact"("createdAt");
CREATE UNIQUE INDEX "ConsentStatement_version_key" ON "ConsentStatement"("version");
CREATE INDEX "ConsentStatement_channel_audience_retiredAt_idx" ON "ConsentStatement"("channel", "audience", "retiredAt");
CREATE UNIQUE INDEX "MarketingPreference_contactId_channel_audience_key" ON "MarketingPreference"("contactId", "channel", "audience");
CREATE INDEX "MarketingPreference_status_channel_audience_idx" ON "MarketingPreference"("status", "channel", "audience");
CREATE INDEX "MarketingPreference_statementId_idx" ON "MarketingPreference"("statementId");
CREATE INDEX "MarketingConsentEvent_preferenceId_occurredAt_idx" ON "MarketingConsentEvent"("preferenceId", "occurredAt");
CREATE INDEX "MarketingConsentEvent_action_occurredAt_idx" ON "MarketingConsentEvent"("action", "occurredAt");
CREATE UNIQUE INDEX "MarketingSuppression_contactId_channel_key" ON "MarketingSuppression"("contactId", "channel");
CREATE INDEX "MarketingSuppression_reason_createdAt_idx" ON "MarketingSuppression"("reason", "createdAt");
CREATE UNIQUE INDEX "MarketingToken_tokenHash_key" ON "MarketingToken"("tokenHash");
CREATE INDEX "MarketingToken_preferenceId_purpose_idx" ON "MarketingToken"("preferenceId", "purpose");
CREATE INDEX "MarketingToken_expiresAt_idx" ON "MarketingToken"("expiresAt");
CREATE INDEX "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");
CREATE INDEX "MarketingCampaign_createdAt_idx" ON "MarketingCampaign"("createdAt");
CREATE UNIQUE INDEX "MarketingDelivery_campaignId_contactId_key" ON "MarketingDelivery"("campaignId", "contactId");
CREATE INDEX "MarketingDelivery_status_createdAt_idx" ON "MarketingDelivery"("status", "createdAt");
CREATE INDEX "MarketingDelivery_contactId_createdAt_idx" ON "MarketingDelivery"("contactId", "createdAt");

ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingContact" ADD CONSTRAINT "MarketingContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingPreference" ADD CONSTRAINT "MarketingPreference_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingPreference" ADD CONSTRAINT "MarketingPreference_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "ConsentStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "MarketingPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "ConsentStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingSuppression" ADD CONSTRAINT "MarketingSuppression_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingToken" ADD CONSTRAINT "MarketingToken_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "MarketingPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "MarketingContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingDelivery" ADD CONSTRAINT "MarketingDelivery_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "MarketingPreference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
