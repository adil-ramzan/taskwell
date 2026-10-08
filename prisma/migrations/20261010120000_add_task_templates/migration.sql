-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueOffsetDays" INTEGER,
    "assigneeId" TEXT,
    "ownerId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplateLabel" (
    "templateId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "TaskTemplateLabel_pkey" PRIMARY KEY ("templateId","labelId")
);

-- CreateTable
CREATE TABLE "TaskTemplateSubtask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "TaskTemplateSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_assigneeId_idx" ON "TaskTemplate"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_ownerId_nameKey_key" ON "TaskTemplate"("ownerId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplate_teamId_nameKey_key" ON "TaskTemplate"("teamId", "nameKey");

-- CreateIndex
CREATE INDEX "TaskTemplateLabel_labelId_idx" ON "TaskTemplateLabel"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplateSubtask_templateId_position_key" ON "TaskTemplateSubtask"("templateId", "position");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateLabel" ADD CONSTRAINT "TaskTemplateLabel_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateLabel" ADD CONSTRAINT "TaskTemplateLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateSubtask" ADD CONSTRAINT "TaskTemplateSubtask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Last line of defence behind the validation in lib/template-rules.ts.
-- A template belongs to exactly one workspace: a person or a team, never both, never neither.
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_one_workspace" CHECK (("ownerId" IS NULL) <> ("teamId" IS NULL));
-- Only a team's template can name an assignee: personal projects have none.
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_personal_no_assignee" CHECK ("teamId" IS NOT NULL OR "assigneeId" IS NULL);
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_name_length" CHECK (char_length("name") BETWEEN 1 AND 100 AND char_length("nameKey") BETWEEN 1 AND 100);
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_description_length" CHECK ("description" IS NULL OR char_length("description") <= 2000);
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_due_offset_range" CHECK ("dueOffsetDays" IS NULL OR "dueOffsetDays" BETWEEN 0 AND 365);
ALTER TABLE "TaskTemplateSubtask" ADD CONSTRAINT "TaskTemplateSubtask_title_length" CHECK (char_length("title") BETWEEN 1 AND 200);
ALTER TABLE "TaskTemplateSubtask" ADD CONSTRAINT "TaskTemplateSubtask_position_range" CHECK ("position" BETWEEN 0 AND 19);
