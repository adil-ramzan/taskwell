import { LayoutTemplate, Plus } from "lucide-react";
import type { Metadata } from "next";

import EmptyState from "@/components/dashboard/EmptyState";
import PageIntro from "@/components/dashboard/PageIntro";
import TemplateFormButton from "@/components/dashboard/TemplateFormButton";
import TemplatesView from "@/components/dashboard/TemplatesView";
import { requireDashboardUser } from "@/lib/dashboard";
import { listLabelWorkspaces } from "@/lib/labels";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { listTemplatesForUser } from "@/lib/task-templates";

export const metadata: Metadata = {
  title: "Templates",
};

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";

export default async function TemplatesPage() {
  const user = await requireDashboardUser("/dashboard/templates");
  // All scoped to the session user; failures surface through app/dashboard/error.tsx.
  const [templates, workspaces, projects] = await Promise.all([
    listTemplatesForUser(user.id),
    // Where a template can be created: the user's own templates and each of their teams.
    listLabelWorkspaces(user.id),
    // For the "Use template" dialog: where the new task can go.
    listProjectOptionsForOwner(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro title="Templates" description="Reusable starting points for the tasks you create again and again." />
        <TemplateFormButton workspaces={workspaces} className={createButtonClass}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create template
        </TemplateFormButton>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState
            icon={LayoutTemplate}
            title="No templates yet"
            description="Create a template with the status, priority, due date, labels and subtasks a kind of task always starts with."
          >
            <TemplateFormButton
              workspaces={workspaces}
              className={`${createButtonClass} dark:focus-visible:ring-offset-dark-surface`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create template
            </TemplateFormButton>
          </EmptyState>
        </div>
      ) : (
        <TemplatesView templates={templates} workspaces={workspaces} projects={projects} />
      )}
    </div>
  );
}
