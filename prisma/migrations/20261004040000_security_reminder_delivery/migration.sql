ALTER TABLE "User" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
ALTER TABLE "VideoJob" ADD COLUMN "uploadedById" TEXT;
ALTER TABLE "RestockSubscription" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL, "dedupKey" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL, "recipient" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "providerPayload" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT, "lockedUntil" TIMESTAMP(3), "firstAttemptAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3), "providerMessageId" TEXT, "lastError" TEXT,
  "recoveryTokenHash" TEXT, "tokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailDelivery_dedupKey_key" ON "EmailDelivery"("dedupKey");
CREATE UNIQUE INDEX "EmailDelivery_recoveryTokenHash_key" ON "EmailDelivery"("recoveryTokenHash");
CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx" ON "EmailDelivery"("status", "nextAttemptAt");
CREATE INDEX "EmailDelivery_kind_resourceId_idx" ON "EmailDelivery"("kind", "resourceId");
CREATE INDEX "EmailDelivery_recipient_status_idx" ON "EmailDelivery"("recipient", "status");
CREATE TABLE "CartReminderPreference" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "unsubscribeTokenHash" TEXT, "optedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartReminderPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CartReminderPreference_email_key" ON "CartReminderPreference"("email");
CREATE UNIQUE INDEX "CartReminderPreference_unsubscribeTokenHash_key" ON "CartReminderPreference"("unsubscribeTokenHash");
-- Respect opt-outs already issued by the old per-cart implementation.
INSERT INTO "CartReminderPreference" ("id", "email", "optedOutAt", "updatedAt")
SELECT md5(lower(trim("email"))), lower(trim("email")), MIN("updatedAt"), CURRENT_TIMESTAMP
FROM "AbandonedCart" WHERE "status" = 'OPTED_OUT' GROUP BY lower(trim("email"))
ON CONFLICT ("email") DO UPDATE SET "optedOutAt" = EXCLUDED."optedOutAt";
