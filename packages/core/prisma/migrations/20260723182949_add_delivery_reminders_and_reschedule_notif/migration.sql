-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_DELIVERY_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_DELIVERY_NOW';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_RESCHEDULED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReminderType" ADD VALUE 'DELIVERY_30M';
ALTER TYPE "ReminderType" ADD VALUE 'DELIVERY_NOW';
