/*
  Warnings:

  - Added the required column `memoryUsage` to the `Telemetry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."InterfaceStat" ADD COLUMN     "ipAddress" TEXT;

-- AlterTable
ALTER TABLE "public"."Telemetry" ADD COLUMN     "memoryUsage" TEXT NOT NULL;
