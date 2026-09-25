-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "hybridAllowedVlan" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "hybridUntaggedVlan" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trunkAllowedVlan" TEXT NOT NULL DEFAULT 'all';
