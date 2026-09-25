-- CreateTable
CREATE TABLE "public"."L3Interface" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "interfaceKind" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL,
    "vlanId" INTEGER,
    "port" TEXT,
    "ipv4Address" TEXT,
    "ipv6Address" TEXT,
    "secondaryIpv4" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondaryIpv6" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "L3Interface_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "L3Interface_deviceId_interfaceName_key" ON "public"."L3Interface"("deviceId", "interfaceName");

-- AddForeignKey
ALTER TABLE "public"."L3Interface" ADD CONSTRAINT "L3Interface_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
