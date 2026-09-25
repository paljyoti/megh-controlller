-- CreateTable
CREATE TABLE "public"."DhcpPool" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "poolName" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "netmask" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "leasePeriod" TEXT NOT NULL DEFAULT 'forever',
    "leaseDays" INTEGER,
    "leaseHours" INTEGER,
    "leaseMinutes" INTEGER,
    "dns" TEXT NOT NULL,
    "backupDns" TEXT,
    "option43" TEXT,
    "addressSegments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "nakStatus" TEXT NOT NULL DEFAULT 'disabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpPool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DhcpPool_deviceId_network_netmask_key" ON "public"."DhcpPool"("deviceId", "network", "netmask");

-- AddForeignKey
ALTER TABLE "public"."DhcpPool" ADD CONSTRAINT "DhcpPool_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
