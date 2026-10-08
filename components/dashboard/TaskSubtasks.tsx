"use client";

import { ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { TaskSummary } from "@/lib/tasks";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import CreateTaskButton, { type ProjectOption } from "./CreateTaskButton";
import { deleteIconButtonClass, editButtonClass, editIconButtonClass } from "./detail-styles";
import DueDate from "./DueDate";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge, TaskStatusBadge } from "./TaskBadges";

interface TaskSubtasksProps {
  /** The task whose subtasks these are. */
  parent: TaskSummary;
  /** Oldest first; every one is an ordinary task of the parent's project. */
  subtasks: TaskSummary[];
  projects: ProjectOption[];
}

/**
 * A task's subtasks with the progress counted from them. Ticking one sets its
 * status to Completed (unticking, to To do) through the ordinary task API, so
 * it is recorded in the subtask's history like any other status change. The
 * parent's own status is never changed from here.
 */
export default function TaskSubtasks({ parent, subtasks, projects }: TaskSubtasksProps) {
  const router = useRouter();
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // A tick shows at once and is confirmed (or taken back) by the server's answer.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const isDone = (subtask: TaskSummary) => ticked[subtask.id] ?? subtask.status === "COMPLETED";
  const completed = subtasks.filter(isDone).length;

  // An assumed state is dropped once the server's data agrees with it. Data that still disagrees
  // may be a refresh that was already on its way before the change, so it doesn't overrule the tick.
  useEffect(() => {
    setTicked((current) => {
      const pending = Object.entries(current).filter(([id, done]) =>
        subtasks.some((subtask) => subtask.id === id && (subtask.status === "COMPLETED") !== done),
      );

      return pending.length === Object.keys(current).length ? current : Object.fromEntries(pending);
    });
  }, [subtasks]);

  const untick = (id: string) =>
    setTicked((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  const share = subtasks.length > 0 ? Math.round((completed / subtasks.length) * 100) : 0;

  async function toggle(subtask: TaskSummary, complete: boolean) {
    setError("");
    setTicked((current) => ({ ...current, [subtask.id]: complete }));
    setSaving((current) => new Set(current).add(subtask.id));

    try {
      const response = await fetch(`/api/tasks/${subtask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: complete ? "COMPLETED" : "TODO" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

        untick(subtask.id);
        setError(
          `“${subtask.title}” wasn't changed. ${
            typeof payload?.error === "string" ? payload.error : "Please try again."
          }`,
        );
        return;
      }

      setAnnouncement(`Marked “${subtask.title}” ${complete ? "completed" : "not completed"}.`);
      router.refresh();
      // Should the server's data never come to agree (someone else changed it meanwhile), theirs is shown.
      window.setTimeout(() => untick(subtask.id), 5000);
    } catch {
      untick(subtask.id);
      setError(`“${subtask.title}” wasn't changed. Unable to reach the server. Check your connection and try again.`);
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(subtask.id);
        return next;
      });
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="task-subtasks-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Subtasks
          </h2>
          {/* The sentence carries the progress; the bar only repeats it. */}
          <p className="mt-1 text-sm text-muted dark:text-dark-muted">
            {subtasks.length === 0
              ? "Break this task into smaller steps. Each subtask is a task of its own in the same project."
              : `${completed} of ${subtasks.length} completed (${share}%)`}
          </p>
        </div>
        <CreateTaskButton
          projects={projects}
          parent={{ id: parent.id, title: parent.title, projectId: parent.project.id }}
          className={`${editButtonClass} shrink-0`}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add subtask
        </CreateTaskButton>
      </div>

      {subtasks.length > 0 && (
        <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {subtasks.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted dark:text-dark-muted">
          <ListTree aria-hidden="true" className="h-4 w-4 shrink-0" />
          No subtasks yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/10 border-t border-ink/10 dark:divide-white/10 dark:border-white/10">
          {subtasks.map((subtask) => {
            const done = isDone(subtask);
            const busy = saving.has(subtask.id);

            return (
              <li key={subtask.id} aria-busy={busy} className={`flex flex-wrap items-start gap-2 py-3 sm:flex-nowrap ${busy ? "opacity-60" : ""}`}>
                {/* The label is the whole 44px square, so the box is easy to hit on a phone. */}
                <label className="-ml-2.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={done}
                    // Not disabled while saving: that would drop keyboard focus. A second change just waits its turn.
                    aria-disabled={busy || undefined}
                    onChange={(event) => {
                      if (!busy) void toggle(subtask, event.target.checked);
                    }}
                    className="h-5 w-5 cursor-pointer rounded border-ink/30 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                  />
                  <span className="sr-only">
                    {subtask.title}: completed
                  </span>
                </label>

                <div className="min-w-0 flex-1 pt-2.5">
                  <Link
                    href={`/dashboard/tasks/${subtask.id}`}
                    className={`break-words rounded text-sm font-medium hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [overflow-wrap:anywhere] ${
                      done ? "text-muted line-through dark:text-dark-muted" : "text-ink dark:text-slate-50"
                    }`}
                  >
                    {subtask.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                    <span>
                      <span className="sr-only">Status: </span>
                      <TaskStatusBadge status={subtask.status} />
                    </span>
                    <span>
                      <span className="sr-only">Priority: </span>
                      <TaskPriorityBadge priority={subtask.priority} />
                    </span>
                    {/* Only team-project tasks can be assigned. */}
                    {subtask.project.teamId && (
                      <span className="inline-flex min-w-0 max-w-full items-center">
                        <span className="sr-only">Assignee: </span>
                        <TaskAssignee assignee={subtask.assignee} compact />
                      </span>
                    )}
                    <span className="text-muted dark:text-dark-muted">
                      Due <DueDate value={subtask.dueDate} status={subtask.status} />
                    </span>
                  </div>
                </div>

                {/* On a phone the actions go under the details, so the title keeps the full width. */}
                <div className="flex w-full shrink-0 gap-2 pl-[2.625rem] sm:w-auto sm:pl-0 sm:pt-0.5">
                  <CreateTaskButton task={subtask} projects={projects} className={editIconButtonClass}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">Edit {subtask.title}</span>
                  </CreateTaskButton>
                  <ConfirmDeleteButton
                    className={deleteIconButtonClass}
                    title="Delete subtask"
                    noun="subtask"
                    endpoint={`/api/tasks/${subtask.id}`}
                    description={
                      <>
                        <p>
                          Delete the subtask{" "}
                          <strong className="font-semibold text-ink dark:text-slate-50">{subtask.title}</strong>?
                        </p>
                        <p>Its comments and history go with it. This can&apos;t be undone.</p>
                      </>
                    }
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">Delete {subtask.title}</span>
                  </ConfirmDeleteButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
