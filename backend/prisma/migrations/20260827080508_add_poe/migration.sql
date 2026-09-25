-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "poeLegacyMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "poePowerBudget" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "poeEnabled" BOOLEAN NOT NULL DEFAULT true;
