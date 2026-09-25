-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "portSecurityAgingStatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portSecurityAgingTime" INTEGER,
ADD COLUMN     "portSecurityEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portSecurityMaximum" INTEGER,
ADD COLUMN     "portSecurityStickyMac" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portSecurityViolationMode" TEXT;
