-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'TIME_ENTRY_ADDED' AFTER 'TASK_LABELS_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'TIME_ENTRY_UPDATED' AFTER 'TIME_ENTRY_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'TIME_ENTRY_DELETED' AFTER 'TIME_ENTRY_UPDATED';

-- CreateTable
CREATE TABLE "TaskTimeEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "note" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTimeEntry_taskId_startedAt_idx" ON "TaskTimeEntry"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "TaskTimeEntry_userId_startedAt_idx" ON "TaskTimeEntry"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One running timer per user, whatever the application does: at most one row
-- per user may have no end. (A partial index, which the Prisma schema can't express.)
CREATE UNIQUE INDEX "TaskTimeEntry_one_running_per_user" ON "TaskTimeEntry"("userId") WHERE "endedAt" IS NULL;

-- Last line of defence behind the validation in lib/time-rules.ts.
-- A running entry has neither an end nor a duration; a finished one has both.
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_running_or_finished" CHECK (("endedAt" IS NULL) = ("durationSeconds" IS NULL));
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_ends_after_start" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");
-- One entry is at most 24 hours.
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_duration_range" CHECK ("durationSeconds" IS NULL OR "durationSeconds" BETWEEN 0 AND 86400);
ALTER TABLE "TaskTimeEntry" ADD CONSTRAINT "TaskTimeEntry_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500);
