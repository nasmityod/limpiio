-- CreateEnum
CREATE TYPE "PaymentUploadStatus" AS ENUM ('PENDING', 'LINKED', 'DELETED');

-- CreateTable
CREATE TABLE "PaymentUpload" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "objectKey" TEXT,
    "status" "PaymentUploadStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentUpload_tokenHash_key" ON "PaymentUpload"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentUpload_objectKey_key" ON "PaymentUpload"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentUpload_orderId_key" ON "PaymentUpload"("orderId");

-- CreateIndex
CREATE INDEX "PaymentUpload_status_expiresAt_idx" ON "PaymentUpload"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PaymentUpload_userId_idx" ON "PaymentUpload"("userId");
