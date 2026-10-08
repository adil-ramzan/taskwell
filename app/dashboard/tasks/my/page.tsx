import { ListChecks, Plus } from "lucide-react";
import type { Metadata } from "next";

import CreateTaskButton from "@/components/dashboard/CreateTaskButton";
import EmptyState from "@/components/dashboard/EmptyState";
import PageIntro from "@/components/dashboard/PageIntro";
import TasksView from "@/components/dashboard/TasksView";
import TaskViewSwitch from "@/components/dashboard/TaskViewSwitch";
import { requireDashboardUser } from "@/lib/dashboard";
import { listLabelsForUser } from "@/lib/labels";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { listAssignedTasksForUser } from "@/lib/tasks";

export const metadata: Metadata = {
  title: "My tasks",
};

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";

export default async function MyTasksPage() {
  const user = await requireDashboardUser("/dashboard/tasks/my");
  // "My" is always the session user; there is no user ID in the URL to trust.
  const [tasks, projects, labels] = await Promise.all([
    listAssignedTasksForUser(user.id),
    listProjectOptionsForOwner(user.id),
    // For the label filter.
    listLabelsForUser(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageIntro title="My tasks" description="Tasks in team projects that are assigned to you." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <TaskViewSwitch active="my" />
          <CreateTaskButton projects={projects} className={createButtonClass}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create task
          </CreateTaskButton>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState
            icon={ListChecks}
            title="You don't have any assigned tasks yet."
            description="When a team owner or admin assigns you a task in a team project, it appears here."
          />
        </div>
      ) : (
        <TasksView tasks={tasks} projects={projects} showAssigneeFilter={false} labels={labels} />
      )}
    </div>
  );
}
