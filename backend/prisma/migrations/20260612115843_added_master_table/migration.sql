-- AlterTable
ALTER TABLE "public"."InterfaceStat" ADD COLUMN     "masterId" TEXT;

-- CreateTable
CREATE TABLE "public"."Master" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "softwareVersion" TEXT NOT NULL,
    "cpuUsage" TEXT NOT NULL,
    "memoryUsage" TEXT NOT NULL,
    "temperature" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Master_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Master" ADD CONSTRAINT "Master_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InterfaceStat" ADD CONSTRAINT "InterfaceStat_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "public"."Master"("id") ON DELETE SET NULL ON UPDATE CASCADE;
