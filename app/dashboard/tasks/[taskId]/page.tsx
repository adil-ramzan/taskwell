import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AssigneeSelect from "@/components/dashboard/AssigneeSelect";
import ConfirmDeleteButton from "@/components/dashboard/ConfirmDeleteButton";
import CreateTaskButton from "@/components/dashboard/CreateTaskButton";
import DueDate from "@/components/dashboard/DueDate";
import FormattedDate from "@/components/dashboard/FormattedDate";
import SubtaskParent from "@/components/dashboard/SubtaskParent";
import TaskActivity from "@/components/dashboard/TaskActivity";
import TaskAttachments from "@/components/dashboard/TaskAttachments";
import TaskComments from "@/components/dashboard/TaskComments";
import TaskDependencies from "@/components/dashboard/TaskDependencies";
import TaskLabels from "@/components/dashboard/TaskLabels";
import TaskRecurrence from "@/components/dashboard/TaskRecurrence";
import TaskReminders from "@/components/dashboard/TaskReminders";
import TaskSubtasks from "@/components/dashboard/TaskSubtasks";
import TaskTimeTracking from "@/components/dashboard/TaskTimeTracking";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/dashboard/TaskBadges";
import {
  backLinkClass,
  cardClass,
  deleteButtonClass,
  editButtonClass,
  termClass,
  valueClass,
} from "@/components/dashboard/detail-styles";
import { listTaskActivity } from "@/lib/activity";
import { listAttachments } from "@/lib/attachments";
import { listCommentsForTask, listMentionableNames } from "@/lib/comments";
import { requireDashboardUser } from "@/lib/dashboard";
import { listDependencies, listDependencyCandidates } from "@/lib/dependencies";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { getTaskById, listSubtasks } from "@/lib/tasks";
import { getTaskTime } from "@/lib/time-tracking";

export const metadata: Metadata = {
  title: "Task",
};

export default async function TaskDetailPage({ params }: { params: { taskId: string } }) {
  const user = await requireDashboardUser(`/dashboard/tasks/${params.taskId}`);
  // All scoped to what the session user can access; a task in a project they
  // can't reach is not found, and its comments and activity are never loaded.
  // Comments and activity come as their latest page; older pages are fetched on request.
  // Subtasks and dependencies are tasks of the same project, behind the same access rule.
  const [task, projects, comments, activity, mentionable, subtasks, dependencies, candidates, time, attachments] = await Promise.all([
    getTaskById(user.id, params.taskId),
    listProjectOptionsForOwner(user.id),
    listCommentsForTask(user.id, params.taskId),
    listTaskActivity(user.id, params.taskId),
    // Who the comment box offers after "@": the other people who can open this task.
    listMentionableNames(user.id, params.taskId),
    listSubtasks(user.id, params.taskId),
    listDependencies(user.id, params.taskId),
    listDependencyCandidates(user.id, params.taskId),
    // Everyone's time entries on the task, and the reader's own running timer.
    getTaskTime(user.id, params.taskId),
    listAttachments(user.id, params.taskId),
  ]);

  if (!task || !dependencies || !time || !attachments || "error" in comments || "error" in activity) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/dashboard/tasks" className={backLinkClass}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to tasks
      </Link>

      <article aria-labelledby="task-title" className={cardClass}>
        {task.parent && <SubtaskParent taskId={task.id} parent={task.parent} />}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1
              id="task-title"
              className="break-words font-display text-2xl font-bold text-ink dark:text-slate-50 sm:text-3xl"
            >
              {task.title}
            </h1>
          </div>
          <div className="flex shrink-0 flex-col gap-3 min-[400px]:flex-row">
            <CreateTaskButton task={task} projects={projects} className={editButtonClass}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
            </CreateTaskButton>
            <ConfirmDeleteButton
              className={deleteButtonClass}
              title="Delete task"
              noun="task"
              endpoint={`/api/tasks/${task.id}`}
              redirectTo="/dashboard/tasks"
              description={
                <>
                  <p>
                    Delete <strong className="font-semibold text-ink dark:text-slate-50">{task.title}</strong>{" "}
                    from {task.project.name}?
                  </p>
                  {/* The server refuses it too; saying so here saves the round trip. */}
                  {task.subtasks.total > 0 ? (
                    <p>
                      It has {task.subtasks.total} {task.subtasks.total === 1 ? "subtask" : "subtasks"}. A task with
                      subtasks can&apos;t be deleted: delete or detach them first.
                    </p>
                  ) : (
                    <p>This can&apos;t be undone.</p>
                  )}
                </>
              }
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete
            </ConfirmDeleteButton>
          </div>
        </div>

        <section aria-labelledby="task-description-heading" className="mt-6">
          <h2 id="task-description-heading" className={termClass}>
            Description
          </h2>
          {task.description ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink dark:text-slate-100">
              {task.description}
            </p>
          ) : (
            <p className="mt-1 text-sm italic text-muted dark:text-dark-muted">No description</p>
          )}
        </section>

        <TaskLabels task={task} />

        <dl className="mt-6 grid gap-x-4 gap-y-5 border-t border-ink/10 pt-5 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <dt className={termClass}>Project</dt>
            <dd className={`${valueClass} break-words`}>
              <Link
                href={`/dashboard/projects/${task.project.id}`}
                className="rounded text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
              >
                {task.project.name}
              </Link>
            </dd>
          </div>
          {/* Only team-project tasks can be assigned; personal tasks don't show the field. */}
          {task.project.teamId && (
            <div className="min-w-0">
              <dt className={termClass}>Assignee</dt>
              <dd className="mt-1 text-sm font-medium">
                <AssigneeSelect task={task} />
              </dd>
            </div>
          )}
          <div>
            <dt className={termClass}>Status</dt>
            <dd className="mt-1">
              <TaskStatusBadge status={task.status} />
            </dd>
          </div>
          <div>
            <dt className={termClass}>Priority</dt>
            <dd className="mt-1">
              <TaskPriorityBadge priority={task.priority} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className={termClass}>Due</dt>
            <dd className={valueClass}>
              <DueDate value={task.dueDate} status={task.status} />
            </dd>
          </div>
          <div>
            <dt className={termClass}>Created</dt>
            <dd className={valueClass}>
              <FormattedDate value={task.createdAt} />
            </dd>
          </div>
          <div>
            <dt className={termClass}>Updated</dt>
            <dd className={valueClass}>
              <FormattedDate value={task.updatedAt} />
            </dd>
          </div>
        </dl>
      </article>

      {/* Only a top-level task can repeat. */}
      {!task.parent && (
        <section aria-labelledby="task-recurrence-heading" className={cardClass}>
          <TaskRecurrence task={task} />
        </section>
      )}

      {/* The reader's own reminders; subtasks have a due date too, so they can have them as well. */}
      <section aria-labelledby="task-reminders-heading" className={cardClass}>
        <TaskReminders task={task} />
      </section>

      {/* A subtask is a task: it has its own timer and its own time. */}
      <section aria-labelledby="task-time-heading" className={cardClass}>
        <TaskTimeTracking taskId={task.id} time={time} />
      </section>

      {/* One level only: a subtask has no subtasks of its own. */}
      {!task.parent && (
        <section aria-labelledby="task-subtasks-heading" className={cardClass}>
          <TaskSubtasks parent={task} subtasks={subtasks} projects={projects} />
        </section>
      )}

      <section aria-labelledby="task-dependencies-heading" className={cardClass}>
        <TaskDependencies taskId={task.id} dependencies={dependencies} candidates={candidates} />
      </section>

      <section aria-labelledby="task-attachments-heading" className={cardClass}>
        <TaskAttachments taskId={task.id} attachments={attachments} />
      </section>

      <section aria-labelledby="task-comments-heading" className={cardClass}>
        <h2 id="task-comments-heading" className="mb-4 font-display text-lg font-semibold text-ink dark:text-slate-50">
          Comments{" "}
          <span className="text-sm font-normal text-muted dark:text-dark-muted">({comments.total})</span>
        </h2>
        <TaskComments
          taskId={task.id}
          comments={comments.comments}
          nextCursor={comments.nextCursor}
          mentionable={mentionable}
          viewerName={user.name}
        />
      </section>

      <section aria-labelledby="task-activity-heading" className={cardClass}>
        <h2 id="task-activity-heading" className="mb-4 font-display text-lg font-semibold text-ink dark:text-slate-50">
          Activity
        </h2>
        <TaskActivity taskId={task.id} activities={activity.activities} nextCursor={activity.nextCursor} />
      </section>
    </div>
  );
}
