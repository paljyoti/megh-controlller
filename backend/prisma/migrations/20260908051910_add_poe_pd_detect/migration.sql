-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "poePdDetectInterval" INTEGER,
ADD COLUMN     "poePdDetectMode" TEXT,
ADD COLUMN     "poePdDetectPeerIp" TEXT,
ADD COLUMN     "poePdDetectTimes" INTEGER;
