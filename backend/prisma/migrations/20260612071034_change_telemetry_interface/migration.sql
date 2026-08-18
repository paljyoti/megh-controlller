/*
  Warnings:

  - You are about to drop the column `ipAddress` on the `InterfaceStat` table. All the data in the column will be lost.
  - You are about to drop the column `memoryUsage` on the `Telemetry` table. All the data in the column will be lost.
  - Made the column `macAddress` on table `InterfaceStat` required. This step will fail if there are existing NULL values in that column.
  - Made the column `softwareVersion` on table `Telemetry` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."InterfaceStat" DROP COLUMN "ipAddress",
ALTER COLUMN "macAddress" SET NOT NULL,
ALTER COLUMN "rxBytes" DROP DEFAULT,
ALTER COLUMN "rxBytes" SET DATA TYPE TEXT,
ALTER COLUMN "txBytes" DROP DEFAULT,
ALTER COLUMN "txBytes" SET DATA TYPE TEXT,
ALTER COLUMN "rxPackets" DROP DEFAULT,
ALTER COLUMN "rxPackets" SET DATA TYPE TEXT,
ALTER COLUMN "txPackets" DROP DEFAULT,
ALTER COLUMN "txPackets" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "public"."Telemetry" DROP COLUMN "memoryUsage",
ALTER COLUMN "softwareVersion" SET NOT NULL;
