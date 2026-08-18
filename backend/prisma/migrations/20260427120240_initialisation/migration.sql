/*
  Warnings:

  - You are about to drop the `telematry` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."telematry" DROP CONSTRAINT "telematry_deviceId_fkey";

-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "hardwareVersion" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "macAddress" TEXT,
ADD COLUMN     "softwareVersion" TEXT,
ALTER COLUMN "status" SET DEFAULT 'unknown',
ALTER COLUMN "organizationId" DROP NOT NULL;

-- DropTable
DROP TABLE "public"."telematry";

-- CreateTable
CREATE TABLE "public"."Telemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "softwareVersion" TEXT,
    "cpuUsage" DOUBLE PRECISION NOT NULL,
    "memoryUsage" DOUBLE PRECISION NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InterfaceStat" (
    "id" TEXT NOT NULL,
    "telemetryId" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "rxBytes" BIGINT NOT NULL DEFAULT 0,
    "txBytes" BIGINT NOT NULL DEFAULT 0,
    "rxPackets" BIGINT NOT NULL DEFAULT 0,
    "txPackets" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterfaceStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "port" TEXT,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceStatus" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "uptime" BIGINT NOT NULL DEFAULT 0,
    "softwareVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommandLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "responseStatus" INTEGER,
    "responseMessage" TEXT,
    "responseData" JSONB,
    "fileType" TEXT,
    "fileUrl" TEXT,
    "algorithm" TEXT,
    "checksum" TEXT,
    "version" TEXT,
    "progress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommandLog_requestId_key" ON "public"."CommandLog"("requestId");

-- AddForeignKey
ALTER TABLE "public"."Telemetry" ADD CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InterfaceStat" ADD CONSTRAINT "InterfaceStat_telemetryId_fkey" FOREIGN KEY ("telemetryId") REFERENCES "public"."Telemetry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceEvent" ADD CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceStatus" ADD CONSTRAINT "DeviceStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommandLog" ADD CONSTRAINT "CommandLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
