"use client";

import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { TemplateSummary } from "@/lib/task-templates";
import { TASK_TITLE_MAX_LENGTH } from "@/lib/task-validation";
import { describeDueOffset } from "@/lib/template-rules";
import { useAssignableMembers } from "./AssignmentContext";
import type { ProjectOption } from "./CreateTaskButton";
import { useTimeZone } from "./TimeZoneContext";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";

interface UseTemplateButtonProps {
  className: string;
  children: ReactNode;
  template: TemplateSummary;
  /** The signed-in user's projects, or null when they couldn't be loaded. */
  projects: ProjectOption[] | null;
  "aria-label"?: string;
}

/**
 * "Use template": asks which project the new task goes into (and for its
 * title), then creates it on the server from the template. The dialog says
 * beforehand which of the template's labels and assignee can't apply in the
 * chosen project; the server decides that again.
 */
export default function UseTemplateButton({ className, children, template, projects, ...rest }: UseTemplateButtonProps) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState(template.name);
  const hasProjects = projects !== null && projects.length > 0;
  const initialProjectId = projects?.length === 1 ? projects[0].id : "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const project = projects?.find((option) => option.id === projectId);
  const timeZone = useTimeZone();
  // Defined only for a team project in a team where this user is owner or admin.
  const assignableMembers = useAssignableMembers(project?.teamId);
  // The template's labels exist in one workspace only: its team's projects, or its owner's personal ones.
  const labelsApply = project ? (project.teamId ?? null) === (template.team?.id ?? null) : true;
  const assigneeApplies = project && template.assignee ? assignableMembers?.some((member) => member.id === template.assignee?.id) === true : true;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function openDialog() {
    setError("");
    setTitle(template.name);
    setProjectId(initialProjectId);
    dialogRef.current?.showModal();
    (hasProjects ? titleRef.current : closeRef.current)?.focus();
    setOpen(true);
  }

  const closeDialog = () => dialogRef.current?.close();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    if (!title.trim()) {
      setError("Enter a task title.");
      return;
    }

    if (!projectId) {
      setError("Choose a project for this task.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/task-templates/${template.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The zone is only used when the account has none saved, to count the due date's days.
        body: JSON.stringify({ projectId, title: title.trim(), ...(timeZone ? { timeZone } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as { task?: { id: string }; error?: unknown } | null;

      if (!response.ok || !payload?.task) {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't create a task from this template right now. Please try again.",
        );
        return;
      }

      closeDialog();
      router.push(`/dashboard/tasks/${payload.task.id}`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const subtaskCount = template.subtasks.length;

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" aria-label={rest["aria-label"]} className={className}>
        {children}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !submitting) closeDialog();
        }}
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <form onSubmit={handleSubmit} noValidate className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                Use template
              </h2>
              <p className="mt-1 break-words text-sm text-muted dark:text-dark-muted">
                Creates a new task from “{template.name}”. The template itself isn&apos;t changed.
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              aria-label="Close"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {!hasProjects ? (
            <div className="mt-5">
              <p className="rounded-lg border border-ink/10 bg-paper px-4 py-3 text-sm text-muted dark:border-white/10 dark:bg-dark-background dark:text-dark-muted">
                {projects === null
                  ? "We couldn't load your projects. Refresh the page and try again."
                  : "Tasks belong to a project. Create a project first, then use this template."}
              </p>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} className={secondaryButtonClass}>
                  Cancel
                </button>
                {projects !== null && (
                  <Link href="/dashboard/projects" onClick={closeDialog} className={primaryButtonClass}>
                    Go to projects
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              {error && (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="mt-5 space-y-5">
                <div>
                  <label htmlFor={`${id}-task-title`} className={labelClass}>
                    Task title
                  </label>
                  <input
                    ref={titleRef}
                    id={`${id}-task-title`}
                    type="text"
                    required
                    maxLength={TASK_TITLE_MAX_LENGTH}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor={`${id}-project`} className={labelClass}>
                    Project
                  </label>
                  <div className="relative">
                    <select
                      id={`${id}-project`}
                      required
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                      aria-describedby={`${id}-applies`}
                      className={`${fieldClass} appearance-none truncate pr-10`}
                    >
                      {projects.length > 1 && (
                        <option value="" disabled>
                          Select a project
                        </option>
                      )}
                      {projects.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                  </div>
                </div>

                <ul id={`${id}-applies`} className="list-disc space-y-1 pl-5 text-sm text-muted dark:text-dark-muted">
                  <li>{describeDueOffset(template.dueOffsetDays)}.</li>
                  <li>
                    {subtaskCount === 0
                      ? "No subtasks."
                      : `${subtaskCount} ${subtaskCount === 1 ? "subtask is" : "subtasks are"} created with it.`}
                  </li>
                  {template.labels.length > 0 && !labelsApply && (
                    <li>
                      This template&apos;s labels belong to {template.team?.name ?? "your personal projects"}, so they aren&apos;t
                      added in this project.
                    </li>
                  )}
                  {template.assignee && !assigneeApplies && (
                    <li>
                      The task starts unassigned: {template.assignee.name} can only be assigned by an owner or admin of a
                      team they belong to.
                    </li>
                  )}
                </ul>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} disabled={submitting} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className={primaryButtonClass}>
                  {submitting ? "Creating..." : "Create task"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
