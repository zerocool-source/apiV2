-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledReason" TEXT;
