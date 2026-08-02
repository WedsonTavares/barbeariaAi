-- CreateTable
CREATE TABLE "EventPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventPhoto_tenantId_sortOrder_idx" ON "EventPhoto"("tenantId", "sortOrder");

-- AddForeignKey
ALTER TABLE "EventPhoto" ADD CONSTRAINT "EventPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
