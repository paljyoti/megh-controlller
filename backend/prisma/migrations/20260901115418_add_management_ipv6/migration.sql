-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "managementIpv6" TEXT,
ADD COLUMN     "managementIpv6Gateway" TEXT,
ADD COLUMN     "managementIpv6Mode" TEXT;
