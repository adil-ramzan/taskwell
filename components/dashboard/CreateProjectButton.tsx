"use client";

import { ChevronDown, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";

import type { CreateDialogHandle } from "./CreateTaskButton";

import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  validateProjectInput,
} from "@/lib/project-validation";

const PROJECTS_PATH = "/dashboard/projects";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";

interface CreateProjectButtonProps {
  className: string;
  children: ReactNode;
  /** When set, the dialog edits this project instead of creating a new one. */
  project?: { id: string; name: string; description: string | null };
  /** Teams the user may create projects in (owner or admin). Shown as a choice when creating. */
  teams?: TeamOption[];
  /** Preselects a team, e.g. on that team's page. */
  defaultTeamId?: string;
}

export type TeamOption = { id: string; name: string };

/**
 * The single project form: a trigger plus a native modal dialog (focus trap,
 * Escape and background inertness come from showModal()). It creates a project,
 * or edits the one passed as `project`.
 */
const CreateProjectButton = forwardRef<CreateDialogHandle, CreateProjectButtonProps>(function CreateProjectButton(
  { className, children, project, teams = [], defaultTeamId = "" },
  ref,
) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function openDialog() {
    setError("");
    formRef.current?.reset();
    dialogRef.current?.showModal();
    nameRef.current?.focus();
    setOpen(true);
  }

  // Lets a parent open the dialog itself (the command palette), without a second form.
  useImperativeHandle(ref, () => ({ open: openDialog }));

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = validateProjectInput({
      name: formData.get("name"),
      description: formData.get("description"),
      // Absent when editing or when the user has no team to choose; the server verifies it.
      teamId: formData.get("teamId"),
    });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `We couldn't ${project ? "update" : "create"} your project right now. Please try again.`,
        );
        return;
      }

      closeDialog();

      // Re-render the server-loaded data in place, or take the user to the list.
      // refresh() also drops cached copies of the other dashboard pages.
      // A new project also stays in place on its team's page, which lists it.
      if (!project && pathname !== PROJECTS_PATH && !pathname.startsWith("/dashboard/teams/")) {
        router.push(PROJECTS_PATH);
      }

      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" className={className}>
        {children}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !submitting) {
            closeDialog();
          }
        }}
        onCancel={(event) => {
          if (submitting) {
            event.preventDefault();
          }
        }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        {/* The key resets the fields to the saved values after an edit. */}
        <form key={project ? `${project.name}\n${project.description}` : undefined} ref={formRef} onSubmit={handleSubmit} noValidate className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                {project ? "Edit project" : "Create project"}
              </h2>
              <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                {project
                  ? "Update this project's name and description."
                  : "Give your project a name to start organizing your work."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              aria-label="Close"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <p
              id={`${id}-error`}
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium text-ink dark:text-slate-100">
                Project name
              </label>
              <input
                ref={nameRef}
                id={`${id}-name`}
                name="name"
                type="text"
                required
                maxLength={PROJECT_NAME_MAX_LENGTH}
                defaultValue={project?.name}
                aria-describedby={error ? `${id}-error` : undefined}
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor={`${id}-description`}
                className="mb-2 block text-sm font-medium text-ink dark:text-slate-100"
              >
                Description <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
              </label>
              <textarea
                id={`${id}-description`}
                name="description"
                rows={3}
                maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                defaultValue={project?.description ?? ""}
                className={`${fieldClass} resize-y`}
              />
            </div>

            {!project && teams.length > 0 && (
              <div>
                <label htmlFor={`${id}-team`} className="mb-2 block text-sm font-medium text-ink dark:text-slate-100">
                  Belongs to
                </label>
                <div className="relative">
                  <select
                    id={`${id}-team`}
                    name="teamId"
                    defaultValue={defaultTeamId}
                    className={`${fieldClass} appearance-none pr-10`}
                  >
                    <option value="">Personal (only you)</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        Team: {team.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
            >
              {project
                ? submitting ? "Saving..." : "Save changes"
                : submitting ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
});

export default CreateProjectButton;
