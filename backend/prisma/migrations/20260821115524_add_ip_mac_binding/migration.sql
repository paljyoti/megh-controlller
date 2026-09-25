-- CreateTable
CREATE TABLE "public"."IpMacBinding" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpMacBinding_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."IpMacBinding" ADD CONSTRAINT "IpMacBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
