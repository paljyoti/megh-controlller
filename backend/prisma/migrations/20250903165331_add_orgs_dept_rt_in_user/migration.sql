/*
  Warnings:

  - Added the required column `refreshToken` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."Organisations" AS ENUM ('TechRoute');

-- CreateEnum
CREATE TYPE "public"."Departments" AS ENUM ('IT', 'Network', 'Sales', 'Development', 'HR');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "dept" "public"."Departments" NOT NULL DEFAULT 'IT',
ADD COLUMN     "orgs" "public"."Organisations" NOT NULL DEFAULT 'TechRoute',
ADD COLUMN     "refreshToken" TEXT NOT NULL;
