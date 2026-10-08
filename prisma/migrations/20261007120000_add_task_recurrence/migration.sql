-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'RECURRENCE_CREATED' AFTER 'DEPENDENCY_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'RECURRENCE_UPDATED' AFTER 'RECURRENCE_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'RECURRENCE_DISABLED' AFTER 'RECURRENCE_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'RECURRENCE_GENERATED' AFTER 'RECURRENCE_DISABLED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurredFromId" TEXT;

-- CreateTable
CREATE TABLE "TaskRecurrence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[],
    "monthDay" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "occurrenceLimit" INTEGER,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "dueTime" TEXT,
    "timeZone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskRecurrence_taskId_key" ON "TaskRecurrence"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_recurredFromId_key" ON "Task"("recurredFromId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurredFromId_fkey" FOREIGN KEY ("recurredFromId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Last line of defence behind the validation in lib/recurrence-rules.ts.
ALTER TABLE "Task" ADD CONSTRAINT "Task_not_own_occurrence" CHECK ("recurredFromId" IS NULL OR "recurredFromId" <> "id");
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_interval_range" CHECK ("interval" BETWEEN 1 AND 99);
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_month_day_range" CHECK ("monthDay" IS NULL OR "monthDay" BETWEEN 1 AND 31);
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_weekdays_range" CHECK ("weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_end_after_start" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_occurrence_counts" CHECK ("occurrenceCount" >= 1 AND ("occurrenceLimit" IS NULL OR "occurrenceLimit" >= 1));
