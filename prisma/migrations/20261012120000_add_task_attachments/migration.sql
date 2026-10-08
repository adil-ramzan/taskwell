-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'ATTACHMENT_ADDED' AFTER 'TIME_ENTRY_DELETED';
ALTER TYPE "ActivityType" ADD VALUE 'ATTACHMENT_DELETED' AFTER 'ATTACHMENT_ADDED';

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_storageKey_key" ON "TaskAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_createdAt_idx" ON "TaskAttachment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAttachment_uploaderId_idx" ON "TaskAttachment"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_taskId_sha256_key" ON "TaskAttachment"("taskId", "sha256");

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Last line of defence behind the validation in lib/attachment-rules.ts.
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_name_length" CHECK (char_length("name") BETWEEN 1 AND 200);
-- 1 byte to 10 MB.
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_size_range" CHECK ("size" BETWEEN 1 AND 10485760);
-- The stored name is a UUID the server generated, never a path.
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_storage_key_format" CHECK ("storageKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
