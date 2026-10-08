-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'SUBTASK_ADDED' AFTER 'TASK_DUE_DATE_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'SUBTASK_REMOVED' AFTER 'SUBTASK_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'DEPENDENCY_ADDED' AFTER 'SUBTASK_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'DEPENDENCY_REMOVED' AFTER 'DEPENDENCY_ADDED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentTaskId" TEXT;

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "blockerTaskId" TEXT NOT NULL,
    "blockedTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskDependency_blockedTaskId_idx" ON "TaskDependency"("blockedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_blockerTaskId_blockedTaskId_key" ON "TaskDependency"("blockerTaskId", "blockedTaskId");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockerTaskId_fkey" FOREIGN KEY ("blockerTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Last line of defence behind the checks in the data layer: a task is never its
-- own parent, and never depends on itself.
ALTER TABLE "Task" ADD CONSTRAINT "Task_not_own_parent" CHECK ("parentTaskId" IS NULL OR "parentTaskId" <> "id");
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_not_self" CHECK ("blockerTaskId" <> "blockedTaskId");
