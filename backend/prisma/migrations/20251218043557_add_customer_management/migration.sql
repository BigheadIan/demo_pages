/*
  Warnings:

  - You are about to drop the column `tags` on the `Customer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "tags",
ADD COLUMN     "crmCustomerId" TEXT,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "externalId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tag_regionId_idx" ON "Tag"("regionId");

-- CreateIndex
CREATE INDEX "Tag_isSystem_idx" ON "Tag"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_regionId_name_key" ON "Tag"("regionId", "name");

-- CreateIndex
CREATE INDEX "CustomerTag_customerId_idx" ON "CustomerTag"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTag_tagId_idx" ON "CustomerTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_customerId_tagId_key" ON "CustomerTag"("customerId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomer_customerCode_key" ON "CrmCustomer"("customerCode");

-- CreateIndex
CREATE INDEX "CrmCustomer_customerCode_idx" ON "CrmCustomer"("customerCode");

-- CreateIndex
CREATE INDEX "CrmCustomer_phone_idx" ON "CrmCustomer"("phone");

-- CreateIndex
CREATE INDEX "CrmCustomer_email_idx" ON "CrmCustomer"("email");

-- CreateIndex
CREATE INDEX "Customer_crmCustomerId_idx" ON "Customer"("crmCustomerId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_crmCustomerId_fkey" FOREIGN KEY ("crmCustomerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
