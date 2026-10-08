import { ArrowLeft, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ConfirmDeleteButton from "@/components/dashboard/ConfirmDeleteButton";
import CreateProjectButton from "@/components/dashboard/CreateProjectButton";
import CreateTaskButton from "@/components/dashboard/CreateTaskButton";
import EmptyState from "@/components/dashboard/EmptyState";
import FormattedDate from "@/components/dashboard/FormattedDate";
import TasksView from "@/components/dashboard/TasksView";
import {
  backLinkClass,
  cardClass,
  deleteButtonClass,
  editButtonClass,
  termClass,
  valueClass,
} from "@/components/dashboard/detail-styles";
import { DELETED_USER } from "@/lib/avatars";
import { requireDashboardUser } from "@/lib/dashboard";
import { listLabelsForProject } from "@/lib/labels";
import { getProjectForOwner, listProjectOptionsForOwner } from "@/lib/projects";
import { listTasksForProject } from "@/lib/tasks";
import { listTeamMembersByTeam } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Project",
};

const addTaskButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface";

export default async function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  const user = await requireDashboardUser(`/dashboard/projects/${params.projectId}`);
  // All scoped to what the session user can access (personal projects and their
  // teams' projects); anything else is not found.
  const [project, tasks, projects, teamMembers, labels] = await Promise.all([
    getProjectForOwner(user.id, params.projectId),
    listTasksForProject(user.id, params.projectId),
    // Lets a task be moved to another project from its row's edit dialog.
    listProjectOptionsForOwner(user.id),
    // For the assignee filter: the members of the session user's own teams.
    listTeamMembersByTeam(user.id),
    // For the label filter: the labels a task of this project can carry (null if the project isn't accessible).
    listLabelsForProject(user.id, params.projectId),
  ]);

  if (!project) {
    notFound();
  }

  const taskCount = tasks.length === 1 ? "1 task" : `${tasks.length} tasks`;
  const addTaskButton = (
    <CreateTaskButton
      projects={[{ id: project.id, name: project.name, teamId: project.team?.id ?? null }]}
      className={addTaskButtonClass}
    >
      <Plus aria-hidden="true" className="h-4 w-4" />
      Add task
    </CreateTaskButton>
  );

  return (
    <div className="space-y-4">
      <Link href="/dashboard/projects" className={backLinkClass}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to projects
      </Link>

      <article aria-labelledby="project-title" className={cardClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1
              id="project-title"
              className="break-words font-display text-2xl font-bold text-ink dark:text-slate-50 sm:text-3xl"
            >
              {project.name}
            </h1>
            <p
              className={`mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm ${
                project.description
                  ? "text-muted dark:text-dark-muted"
                  : "italic text-muted dark:text-dark-muted"
              }`}
            >
              {project.description ?? "No description"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            {addTaskButton}
            {/* Team members without the owner or admin role can't edit or delete the project. */}
            {project.canManage && (
              <>
                <CreateProjectButton project={project} className={editButtonClass}>
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  Edit
                </CreateProjectButton>
                <ConfirmDeleteButton
                  className={deleteButtonClass}
                  title="Delete project"
                  noun="project"
                  endpoint={`/api/projects/${project.id}`}
                  redirectTo="/dashboard/projects"
                  description={
                    <>
                      <p>
                        Delete <strong className="font-semibold text-ink dark:text-slate-50">{project.name}</strong>?
                      </p>
                      <p>
                        {tasks.length === 0
                          ? "This project has no tasks."
                          : `Deleting this project also permanently deletes its ${taskCount}.`}{" "}
                        This can&apos;t be undone.
                      </p>
                    </>
                  }
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Delete
                </ConfirmDeleteButton>
              </>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink/10 pt-5 dark:border-white/10 sm:grid-cols-5">
          <div>
            <dt className={termClass}>Tasks</dt>
            <dd className={valueClass}>{tasks.length}</dd>
          </div>
          <div className="min-w-0">
            <dt className={termClass}>Belongs to</dt>
            <dd className={`${valueClass} truncate`}>
              {project.team ? (
                <Link
                  href={`/dashboard/teams/${project.team.id}`}
                  className="rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
                >
                  {project.team.name}
                </Link>
              ) : (
                "Personal"
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={termClass}>Owner</dt>
            <dd className={`${valueClass} truncate`}>{project.owner?.name ?? DELETED_USER}</dd>
          </div>
          <div>
            <dt className={termClass}>Created</dt>
            <dd className={valueClass}>
              <FormattedDate value={project.createdAt} />
            </dd>
          </div>
          <div>
            <dt className={termClass}>Updated</dt>
            <dd className={valueClass}>
              <FormattedDate value={project.updatedAt} />
            </dd>
          </div>
        </dl>
      </article>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState
            icon={ListChecks}
            title="No tasks in this project yet"
            description="Add a task to start tracking the work in this project."
          >
            {addTaskButton}
          </EmptyState>
        </div>
      ) : (
        <TasksView tasks={tasks} projects={projects} showProject={false} teamMembers={teamMembers} labels={labels ?? undefined} />
      )}
    </div>
  );
}
