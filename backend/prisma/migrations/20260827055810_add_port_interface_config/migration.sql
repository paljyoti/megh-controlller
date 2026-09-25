-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "autoneg" TEXT NOT NULL DEFAULT 'on',
ADD COLUMN     "deviceConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flowControl" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "medium" TEXT NOT NULL DEFAULT 'copper',
ADD COLUMN     "mtu" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "sfpMode" TEXT;
