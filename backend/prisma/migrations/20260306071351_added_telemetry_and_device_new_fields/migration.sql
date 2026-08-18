-- CreateTable
CREATE TABLE "public"."telematry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "cpuUsage" DOUBLE PRECISION NOT NULL,
    "memoryUsage" DOUBLE PRECISION NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "interfaceStats" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."telematry" ADD CONSTRAINT "telematry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
