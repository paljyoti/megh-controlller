/*
  Warnings:

  - Added the required column `speed` to the `Port` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Port" ADD COLUMN     "speed" TEXT NOT NULL;
