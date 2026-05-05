-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('normal', 'important', 'urgent');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AudienceScope" ADD VALUE 'sworn';
ALTER TYPE "AudienceScope" ADD VALUE 'admin';

-- DropIndex
DROP INDEX "Announcement_publishedAt_idx";

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "priority" "AnnouncementPriority" NOT NULL DEFAULT 'normal',
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" TEXT,
ADD COLUMN     "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "Announcement_status_publishedAt_idx" ON "Announcement"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Announcement_pinned_publishedAt_idx" ON "Announcement"("pinned", "publishedAt");

-- CreateIndex
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminRequest" ADD CONSTRAINT "AdminRequest_timeOffRequestId_fkey" FOREIGN KEY ("timeOffRequestId") REFERENCES "TimeOffRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRequest" ADD CONSTRAINT "AdminRequest_shiftSwapRequestId_fkey" FOREIGN KEY ("shiftSwapRequestId") REFERENCES "ShiftSwapRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
