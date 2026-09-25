-- CreateTable
CREATE TABLE "public"."PortSecurityMac" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "sticky" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortSecurityMac_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortSecurityMac_deviceId_port_macAddress_key" ON "public"."PortSecurityMac"("deviceId", "port", "macAddress");

-- AddForeignKey
ALTER TABLE "public"."PortSecurityMac" ADD CONSTRAINT "PortSecurityMac_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
