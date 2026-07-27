-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'POST_EVENT_LOW_RATING';

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "postEventMessage" TEXT,
ADD COLUMN     "reviewLink" TEXT;
