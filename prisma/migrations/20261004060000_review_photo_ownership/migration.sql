CREATE TABLE "ReviewPhotoUpload" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "url" TEXT NOT NULL, "objectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UPLOADING', "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewPhotoUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewPhotoUpload_url_key" ON "ReviewPhotoUpload"("url");
CREATE UNIQUE INDEX "ReviewPhotoUpload_objectKey_key" ON "ReviewPhotoUpload"("objectKey");
CREATE INDEX "ReviewPhotoUpload_userId_status_idx" ON "ReviewPhotoUpload"("userId", "status");
CREATE INDEX "ReviewPhotoUpload_status_expiresAt_idx" ON "ReviewPhotoUpload"("status", "expiresAt");
CREATE INDEX "Review_photos_idx" ON "Review" USING GIN ("photos");
CREATE INDEX "EmailDelivery_status_updatedAt_idx" ON "EmailDelivery"("status", "updatedAt");
