-- CreateEnum
CREATE TYPE "AssignmentPriority" AS ENUM ('low', 'med', 'high');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "priority" "AssignmentPriority" NOT NULL DEFAULT 'med';
