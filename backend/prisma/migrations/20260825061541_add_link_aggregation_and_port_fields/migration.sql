-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "loadBalanceMethod" TEXT NOT NULL DEFAULT 'src-mac';

-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "adminStatus" TEXT NOT NULL DEFAULT 'up',
ADD COLUMN     "duplex" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "speed" TEXT NOT NULL DEFAULT 'auto';

-- CreateTable
CREATE TABLE "public"."LinkAggregation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'static',
    "memberPorts" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkAggregation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkAggregation_deviceId_groupId_key" ON "public"."LinkAggregation"("deviceId", "groupId");

-- AddForeignKey
ALTER TABLE "public"."LinkAggregation" ADD CONSTRAINT "LinkAggregation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
