-- CreateEnum
CREATE TYPE "Region" AS ENUM ('north', 'mid', 'south');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "region" "Region";

-- AlterTable
ALTER TABLE "TechnicianProfile" ADD COLUMN     "region" "Region",
ADD COLUMN     "supervisorId" TEXT;
