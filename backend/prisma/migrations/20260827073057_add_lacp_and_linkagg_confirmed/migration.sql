-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "lacpSystemPriority" INTEGER NOT NULL DEFAULT 32768;

-- AlterTable
ALTER TABLE "public"."LinkAggregation" ADD COLUMN     "deviceConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "lacpPortPriority" INTEGER NOT NULL DEFAULT 32768,
ADD COLUMN     "lacpTimeout" TEXT NOT NULL DEFAULT 'long';
