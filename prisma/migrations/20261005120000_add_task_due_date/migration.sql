-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'TASK_DUE_DATE_CHANGED' AFTER 'TASK_ASSIGNEE_CHANGED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
