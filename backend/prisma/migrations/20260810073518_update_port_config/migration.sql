-- AlterTable
ALTER TABLE "public"."Port" DROP COLUMN "portNumber",
DROP COLUMN "speed",
DROP COLUMN "status",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "portType" TEXT NOT NULL DEFAULT 'access',
ADD COLUMN     "vlanId" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Port_deviceId_name_key" ON "public"."Port"("deviceId", "name");
