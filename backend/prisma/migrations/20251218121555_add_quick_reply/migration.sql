-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL,
    "regionId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "shortcut" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickReply_regionId_idx" ON "QuickReply"("regionId");

-- CreateIndex
CREATE INDEX "QuickReply_category_idx" ON "QuickReply"("category");

-- CreateIndex
CREATE INDEX "QuickReply_isActive_idx" ON "QuickReply"("isActive");

-- CreateIndex
CREATE INDEX "QuickReply_shortcut_idx" ON "QuickReply"("shortcut");

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
