/*
  Warnings:

  - A unique constraint covering the columns `[serialNumber]` on the table `Master` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Master_serialNumber_key" ON "public"."Master"("serialNumber");
