-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'TASK_LABELS_ADDED' AFTER 'RECURRENCE_GENERATED';
ALTER TYPE "ActivityType" ADD VALUE 'TASK_LABELS_REMOVED' AFTER 'TASK_LABELS_ADDED';

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "ownerId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabel" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Label_ownerId_nameKey_key" ON "Label"("ownerId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Label_teamId_nameKey_key" ON "Label"("teamId", "nameKey");

-- CreateIndex
CREATE INDEX "TaskLabel_labelId_idx" ON "TaskLabel"("labelId");

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Last line of defence behind the validation in lib/label-rules.ts.
-- A label belongs to exactly one workspace: a person or a team, never both, never neither.
ALTER TABLE "Label" ADD CONSTRAINT "Label_one_workspace" CHECK (("ownerId" IS NULL) <> ("teamId" IS NULL));
ALTER TABLE "Label" ADD CONSTRAINT "Label_color_palette" CHECK ("color" IN ('gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'));
ALTER TABLE "Label" ADD CONSTRAINT "Label_name_length" CHECK (char_length("name") BETWEEN 1 AND 40 AND char_length("nameKey") BETWEEN 1 AND 40);
