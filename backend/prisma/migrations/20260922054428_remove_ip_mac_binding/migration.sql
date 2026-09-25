/*
  Warnings:

  - You are about to drop the `IpMacBinding` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."IpMacBinding" DROP CONSTRAINT "IpMacBinding_deviceId_fkey";

-- DropTable
DROP TABLE "public"."IpMacBinding";
