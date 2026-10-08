import { ListChecks, Plus } from "lucide-react";
import type { Metadata } from "next";

import CreateTaskButton from "@/components/dashboard/CreateTaskButton";
import EmptyState from "@/components/dashboard/EmptyState";
import PageIntro from "@/components/dashboard/PageIntro";
import TaskBoard from "@/components/dashboard/TaskBoard";
import TaskViewSwitch from "@/components/dashboard/TaskViewSwitch";
import { requireDashboardUser } from "@/lib/dashboard";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { listTasksForOwner } from "@/lib/tasks";
import { listLabelsForUser, listLabelWorkspaces } from "@/lib/labels";
import { listTeamMembersByTeam } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Task board",
};

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";

export default async function TaskBoardPage() {
  const user = await requireDashboardUser("/dashboard/tasks/board");
  // Two queries for the whole board, both scoped to the session user; failures
  // surface through app/dashboard/error.tsx.
  const [tasks, projects, teamMembers, labels, labelWorkspaces] = await Promise.all([
    listTasksForOwner(user.id),
    listProjectOptionsForOwner(user.id),
    // For the assignee filter: the members of the session user's own teams.
    listTeamMembersByTeam(user.id),
    // For the label filter and the Manage labels dialog: the user's own and their teams' labels.
    listLabelsForUser(user.id),
    listLabelWorkspaces(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageIntro title="Task board" description="Drag tasks between columns to update their status." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <TaskViewSwitch active="board" />
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
            title="No tasks yet"
            description={
              projects.length === 0
                ? "Tasks belong to a project. Create a project first, then add your first task."
                : "Create your first task to see it on the board."
            }
          >
            <CreateTaskButton
              projects={projects}
              className={`${createButtonClass} dark:focus-visible:ring-offset-dark-surface`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create task
            </CreateTaskButton>
          </EmptyState>
        </div>
      ) : (
        <TaskBoard tasks={tasks} projects={projects} teamMembers={teamMembers} labels={labels} labelWorkspaces={labelWorkspaces} />
      )}
    </div>
  );
}
