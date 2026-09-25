-- CreateTable
CREATE TABLE "public"."MacEntry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "vlanId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dynamic',
    "learnedAt" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MacEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Neighbor" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "localPort" TEXT NOT NULL,
    "remoteChassisId" TEXT,
    "remoteSystemName" TEXT,
    "remotePort" TEXT,
    "remoteMgmtIp" TEXT,
    "remoteDescription" TEXT,
    "remoteDeviceId" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Neighbor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MacEntry_deviceId_port_idx" ON "public"."MacEntry"("deviceId", "port");

-- CreateIndex
CREATE UNIQUE INDEX "MacEntry_deviceId_port_mac_vlanId_key" ON "public"."MacEntry"("deviceId", "port", "mac", "vlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Neighbor_deviceId_localPort_key" ON "public"."Neighbor"("deviceId", "localPort");

-- AddForeignKey
ALTER TABLE "public"."MacEntry" ADD CONSTRAINT "MacEntry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Neighbor" ADD CONSTRAINT "Neighbor_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
