-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "poePowerAlarmPercent" INTEGER,
ADD COLUMN     "poePowerReservedPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "poeForceOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "poeLegacyMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "poeMaxPower" INTEGER,
ADD COLUMN     "poePdDescription" TEXT,
ADD COLUMN     "poePriority" TEXT NOT NULL DEFAULT 'low';
