-- CreateEnum
CREATE TYPE "TechOpsEntryType" AS ENUM ('repairs_needed', 'service_repairs', 'chemical_order', 'chemicals_dropoff', 'windy_day_cleanup', 'report_issue', 'supervisor_concerns', 'add_notes', 'chemical_issue', 'equipment_failure', 'safety_concern', 'general_note');

-- CreateEnum
CREATE TYPE "TechOpsPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "TechOpsStatus" AS ENUM ('pending', 'in_progress', 'reviewed', 'resolved', 'completed', 'cancelled', 'archived', 'dismissed');

-- CreateEnum
CREATE TYPE "TechOpsOrderStatus" AS ENUM ('pending', 'sent_to_vendor', 'confirmed', 'delivered');

-- CreateTable
CREATE TABLE "TechOpsEntry" (
    "id" TEXT NOT NULL,
    "serviceRepairNumber" TEXT,
    "entryType" "TechOpsEntryType" NOT NULL,
    "technicianName" TEXT,
    "technicianId" TEXT,
    "positionType" TEXT,
    "propertyId" TEXT,
    "propertyName" TEXT,
    "propertyAddress" TEXT,
    "issueTitle" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "priority" "TechOpsPriority" NOT NULL DEFAULT 'normal',
    "status" "TechOpsStatus" NOT NULL DEFAULT 'pending',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "chemicals" TEXT,
    "quantity" TEXT,
    "issueType" TEXT,
    "photos" TEXT[],
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "vendorId" TEXT,
    "vendorName" TEXT,
    "orderStatus" "TechOpsOrderStatus" NOT NULL DEFAULT 'pending',
    "invoiceSentAt" TIMESTAMP(3),
    "invoiceSentToVendorId" TEXT,
    "invoiceTemplateId" TEXT,
    "partsCost" INTEGER DEFAULT 0,
    "commissionPercent" INTEGER,
    "commissionAmount" INTEGER,
    "convertedToEstimateId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechOpsEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TechOpsEntry" ADD CONSTRAINT "TechOpsEntry_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechOpsEntry" ADD CONSTRAINT "TechOpsEntry_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechOpsEntry" ADD CONSTRAINT "TechOpsEntry_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
