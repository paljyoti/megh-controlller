-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "errdisableTimeoutEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "errdisableTimeoutInterval" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "loopDetectEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loopDetectInterval" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "loopDetectTrapEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stpForwardDelay" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "stpHelloTime" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "stpMaxAge" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "stpMode" TEXT NOT NULL DEFAULT 'rstp',
ADD COLUMN     "stpPriority" INTEGER NOT NULL DEFAULT 32768;

-- AlterTable
ALTER TABLE "public"."IpMacBinding" ADD COLUMN     "vlanId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "loopDetectAction" TEXT NOT NULL DEFAULT 'alarm',
ADD COLUMN     "loopDetectEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loopDetectVlans" TEXT,
ADD COLUMN     "stpBpduGuard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stpEdgePort" TEXT,
ADD COLUMN     "stpPathCost" INTEGER,
ADD COLUMN     "stpPriority" INTEGER NOT NULL DEFAULT 128;
