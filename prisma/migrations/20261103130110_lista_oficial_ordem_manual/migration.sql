-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AWAITING_LOGO', 'SUGGESTED', 'LINKED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ListSource" AS ENUM ('CSV', 'XLSX', 'PDF', 'IMAGE');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "importedListId" TEXT;

-- AlterTable
ALTER TABLE "Sponsorship" ADD COLUMN     "eventOrder" INTEGER;

-- CreateTable
CREATE TABLE "ImportedList" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ListSource" NOT NULL,
    "fileKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorSlot" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "listName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "seller" TEXT,
    "quotaValue" DECIMAL(12,2),
    "paymentMethod" TEXT,
    "notes" TEXT,
    "sponsorshipId" TEXT,
    "pendingAssetId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "status" "SlotStatus" NOT NULL DEFAULT 'AWAITING_LOGO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportedList_eventId_createdAt_idx" ON "ImportedList"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "SponsorSlot_listId_status_idx" ON "SponsorSlot"("listId", "status");

-- CreateIndex
CREATE INDEX "SponsorSlot_sponsorshipId_idx" ON "SponsorSlot"("sponsorshipId");

-- CreateIndex
CREATE INDEX "SponsorSlot_pendingAssetId_idx" ON "SponsorSlot"("pendingAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorSlot_listId_order_key" ON "SponsorSlot"("listId", "order");

-- CreateIndex
CREATE INDEX "CompanyAlias_companyId_idx" ON "CompanyAlias"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_organizationId_normalizedAlias_key" ON "CompanyAlias"("organizationId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "MediaAsset_importedListId_idx" ON "MediaAsset"("importedListId");

-- CreateIndex
CREATE INDEX "Sponsorship_eventId_eventOrder_idx" ON "Sponsorship"("eventId", "eventOrder");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_importedListId_fkey" FOREIGN KEY ("importedListId") REFERENCES "ImportedList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedList" ADD CONSTRAINT "ImportedList_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedList" ADD CONSTRAINT "ImportedList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorSlot" ADD CONSTRAINT "SponsorSlot_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ImportedList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorSlot" ADD CONSTRAINT "SponsorSlot_sponsorshipId_fkey" FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorSlot" ADD CONSTRAINT "SponsorSlot_pendingAssetId_fkey" FOREIGN KEY ("pendingAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
