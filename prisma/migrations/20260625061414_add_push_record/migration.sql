-- CreateTable
CREATE TABLE "PushRecord" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "xrayKey" TEXT NOT NULL,
    "xrayUrl" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationId" TEXT,

    CONSTRAINT "PushRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushRecord_fingerprint_key" ON "PushRecord"("fingerprint");

-- CreateIndex
CREATE INDEX "PushRecord_generationId_idx" ON "PushRecord"("generationId");

-- AddForeignKey
ALTER TABLE "PushRecord" ADD CONSTRAINT "PushRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
