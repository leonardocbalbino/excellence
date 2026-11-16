-- CreateEnum
CREATE TYPE "patrol_checkin_mode" AS ENUM ('qr', 'photo', 'qr_and_photo');

-- AlterTable
ALTER TABLE "clock_settings" ADD COLUMN     "late_reason_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "late_tolerance_minutes" SMALLINT NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "late_reason" TEXT;

-- AlterTable
ALTER TABLE "patrol_routes" ADD COLUMN     "checkin_mode" "patrol_checkin_mode" NOT NULL DEFAULT 'qr';

-- AlterTable
ALTER TABLE "patrol_runs" ADD COLUMN     "checkin_mode" "patrol_checkin_mode" NOT NULL DEFAULT 'qr';

-- AlterTable
ALTER TABLE "patrol_checkins" ADD COLUMN     "photo_file_id" UUID;

