-- CreateTable
CREATE TABLE "public"."RouteConfig" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "isDefaultRoute" BOOLEAN NOT NULL DEFAULT false,
    "destIpSegment" TEXT NOT NULL,
    "destIpMask" TEXT NOT NULL,
    "interfaceType" TEXT NOT NULL DEFAULT 'null0 interface',
    "forwardingRoutingAddress" TEXT,
    "distanceMetric" INTEGER,
    "routingTag" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteConfig_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."RouteConfig" ADD CONSTRAINT "RouteConfig_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
