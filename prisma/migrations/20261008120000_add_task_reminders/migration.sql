-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_REMINDER';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "reminderKey" TEXT;

-- CreateTable
CREATE TABLE "TaskReminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "timeZone" TEXT,
    "remindAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskReminder_processedAt_remindAt_idx" ON "TaskReminder"("processedAt", "remindAt");

-- CreateIndex
CREATE INDEX "TaskReminder_userId_idx" ON "TaskReminder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminder_taskId_userId_minutesBefore_key" ON "TaskReminder"("taskId", "userId", "minutesBefore");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_reminderKey_key" ON "Notification"("reminderKey");

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Last line of defence behind the validation in lib/reminder-rules.ts.
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_minutes_range" CHECK ("minutesBefore" BETWEEN 1 AND 40320);
