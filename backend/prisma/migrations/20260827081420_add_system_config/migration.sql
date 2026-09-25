-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "configSaved" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hostname" TEXT,
ADD COLUMN     "managementGateway" TEXT,
ADD COLUMN     "managementIp" TEXT,
ADD COLUMN     "managementIpMode" TEXT,
ADD COLUMN     "managementVlanId" INTEGER,
ADD COLUMN     "ntpServer" TEXT,
ADD COLUMN     "sshServerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telnetServerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "webServerMode" TEXT;
