"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { LabelSummary, LabelWorkspace } from "@/lib/labels";
import type { TemplateSummary } from "@/lib/task-templates";
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX_LENGTH,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/lib/task-validation";
import {
  MAX_DUE_OFFSET_DAYS,
  MAX_TEMPLATE_SUBTASKS,
  TEMPLATE_NAME_MAX_LENGTH,
  validateTemplateInput,
} from "@/lib/template-rules";
import { useAssignableMembers } from "./AssignmentContext";
import LabelChip from "./LabelChip";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";
const optionalClass = "font-normal text-muted dark:text-dark-muted";
const hintClass = "text-sm text-muted dark:text-dark-muted";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50";

interface TemplateFormButtonProps {
  className: string;
  children: ReactNode;
  /** Where a template can be created: the user's personal templates and each of their teams. */
  workspaces: LabelWorkspace[];
  /** When set, the dialog edits this template instead of creating one. */
  template?: TemplateSummary;
  "aria-label"?: string;
}

type FormState = {
  name: string;
  teamId: string;
  description: string;
  status: string;
  priority: string;
  dueOffset: string;
  assigneeId: string;
  labelIds: string[];
  subtasks: string[];
};

const formOf = (template: TemplateSummary | undefined): FormState => ({
  name: template?.name ?? "",
  teamId: template?.team?.id ?? "",
  description: template?.description ?? "",
  status: template?.status ?? "TODO",
  priority: template?.priority ?? "MEDIUM",
  dueOffset: template?.dueOffsetDays == null ? "" : String(template.dueOffsetDays),
  assigneeId: template?.assignee?.id ?? "",
  labelIds: template?.labels.map((label) => label.id) ?? [],
  subtasks: template?.subtasks ?? [],
});

/**
 * The single template form, built like the task dialog: a trigger plus a native
 * modal dialog. It creates a template, or edits the one passed as `template`.
 * The server validates everything again and decides who may save what.
 */
export default function TemplateFormButton({ className, children, workspaces, template, ...rest }: TemplateFormButtonProps) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const subtaskRefs = useRef<(HTMLInputElement | null)[]>([]);
  // The subtask row to focus once it has rendered (a row just added, or one that moved).
  const focusSubtask = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(() => formOf(template));
  // Every label the user can use; the form shows those of the chosen workspace.
  const [labels, setLabels] = useState<LabelSummary[] | null>(null);
  const [labelsError, setLabelsError] = useState(false);
  // Defined only for a team where this user is owner or admin: who may be the default assignee.
  const assignableMembers = useAssignableMembers(form.teamId || null);
  const workspaceLabels = (labels ?? []).filter((label) => (label.team?.id ?? "") === form.teamId);
  const set = (change: Partial<FormState>) => setForm((current) => ({ ...current, ...change }));

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (focusSubtask.current === null) return;

    subtaskRefs.current[focusSubtask.current]?.focus();
    focusSubtask.current = null;
  }, [form.subtasks]);

  async function loadLabels() {
    setLabels(null);
    setLabelsError(false);

    try {
      const response = await fetch("/api/labels", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { labels?: LabelSummary[] } | null;

      if (!response.ok || !Array.isArray(payload?.labels)) {
        setLabelsError(true);
        return;
      }

      setLabels(payload.labels);
    } catch {
      setLabelsError(true);
    }
  }

  function openDialog() {
    setError("");
    setForm(formOf(template));
    dialogRef.current?.showModal();
    nameRef.current?.focus();
    setOpen(true);
    void loadLabels();
  }

  const closeDialog = () => dialogRef.current?.close();

  function moveSubtask(index: number, by: -1 | 1) {
    const subtasks = [...form.subtasks];
    [subtasks[index], subtasks[index + by]] = [subtasks[index + by], subtasks[index]];
    focusSubtask.current = index + by;
    set({ subtasks });
  }

  function addSubtask() {
    if (form.subtasks.length >= MAX_TEMPLATE_SUBTASKS) return;

    focusSubtask.current = form.subtasks.length;
    set({ subtasks: [...form.subtasks, ""] });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    const dueOffset = form.dueOffset.trim();
    // Rows left empty are simply not part of the template.
    const subtasks = form.subtasks.map((title) => title.trim()).filter(Boolean);
    const result = validateTemplateInput({
      name: form.name,
      description: form.description,
      status: form.status,
      priority: form.priority,
      // Not a whole number: sent as it is, so the validator's own message explains what is expected.
      dueOffsetDays: dueOffset === "" ? null : /^\d+$/.test(dueOffset) ? Number(dueOffset) : dueOffset,
      // Only sent when the field is shown; the server decides whether it is allowed.
      ...(assignableMembers ? { assigneeId: form.assigneeId || null } : {}),
      // Until the labels have loaded there is nothing to change them with, so an edit leaves them alone.
      ...(labels || !template ? { labelIds: form.labelIds.filter((labelId) => workspaceLabels.some((label) => label.id === labelId)) } : {}),
      subtasks,
      ...(form.teamId ? { teamId: form.teamId } : {}),
    });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      // A template never changes workspace, so an edit doesn't send one.
      const { teamId: _teamId, ...fields } = result.data;
      const body = template
        ? { ...fields, ...(assignableMembers ? {} : { assigneeId: undefined }), ...(labels ? {} : { labelIds: undefined }) }
        : result.data;
      const response = await fetch(template ? `/api/task-templates/${template.id}` : "/api/task-templates", {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `We couldn't ${template ? "save" : "create"} this template right now. Please try again.`,
        );
        return;
      }

      closeDialog();
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
                {template ? "Edit template" : "Create template"}
              </h2>
              <p className={`mt-1 ${hintClass}`}>
                {template
                  ? "Changes apply to tasks created from now on. Tasks already created stay as they are."
                  : "The values a new task starts with when it is created from this template."}
              </p>
            </div>
            <button type="button" onClick={closeDialog} disabled={submitting} aria-label="Close" className={iconButtonClass}>
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

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
              <label htmlFor={`${id}-name`} className={labelClass}>
                Template name
              </label>
              <input
                ref={nameRef}
                id={`${id}-name`}
                type="text"
                required
                autoComplete="off"
                maxLength={TEMPLATE_NAME_MAX_LENGTH}
                value={form.name}
                onChange={(event) => set({ name: event.target.value })}
                aria-describedby={`${id}-name-hint${error ? ` ${id}-error` : ""}`}
                className={fieldClass}
              />
              <p id={`${id}-name-hint`} className="mt-1 text-xs text-muted dark:text-dark-muted">
                Also the title a new task starts with; it can be changed when the template is used.
              </p>
            </div>

            {template ? (
              <div>
                <p className={labelClass}>Belongs to</p>
                <p className={`break-words ${hintClass}`}>
                  <span className="font-medium text-ink dark:text-slate-100">{template.team?.name ?? "Personal"}</span>. A
                  template stays in the workspace it was created in.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor={`${id}-workspace`} className={labelClass}>
                  Belongs to
                </label>
                <div className="relative">
                  <select
                    id={`${id}-workspace`}
                    value={form.teamId}
                    // Labels and an assignee belong to one workspace, so they can't come along to another.
                    onChange={(event) => set({ teamId: event.target.value, labelIds: [], assigneeId: "" })}
                    className={`${fieldClass} appearance-none truncate pr-10`}
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.teamId ?? "personal"} value={workspace.teamId ?? ""}>
                        {workspace.teamId ? workspace.name : "Personal (only me)"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                </div>
              </div>
            )}

            <div>
              <label htmlFor={`${id}-description`} className={labelClass}>
                Description <span className={optionalClass}>(optional)</span>
              </label>
              <textarea
                id={`${id}-description`}
                rows={3}
                maxLength={TASK_DESCRIPTION_MAX_LENGTH}
                value={form.description}
                onChange={(event) => set({ description: event.target.value })}
                className={`${fieldClass} resize-y`}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-status`} className={labelClass}>
                  Status
                </label>
                <div className="relative">
                  <select
                    id={`${id}-status`}
                    value={form.status}
                    onChange={(event) => set({ status: event.target.value })}
                    className={`${fieldClass} appearance-none pr-10`}
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                </div>
              </div>
              <div>
                <label htmlFor={`${id}-priority`} className={labelClass}>
                  Priority
                </label>
                <div className="relative">
                  <select
                    id={`${id}-priority`}
                    value={form.priority}
                    onChange={(event) => set({ priority: event.target.value })}
                    className={`${fieldClass} appearance-none pr-10`}
                  >
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {taskPriorityLabels[priority]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor={`${id}-due`} className={labelClass}>
                Due after (days) <span className={optionalClass}>(optional)</span>
              </label>
              <input
                id={`${id}-due`}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_DUE_OFFSET_DAYS}
                step={1}
                value={form.dueOffset}
                onChange={(event) => set({ dueOffset: event.target.value })}
                aria-describedby={`${id}-due-hint`}
                className={fieldClass}
              />
              <p id={`${id}-due-hint`} className="mt-1 text-xs text-muted dark:text-dark-muted">
                Days after the task is created: 0 is the same day, 7 a week later. Leave empty for no due date.
              </p>
            </div>

            {assignableMembers && (
              <div>
                <label htmlFor={`${id}-assignee`} className={labelClass}>
                  Assignee <span className={optionalClass}>(optional)</span>
                </label>
                <div className="relative">
                  <select
                    id={`${id}-assignee`}
                    value={form.assigneeId}
                    onChange={(event) => set({ assigneeId: event.target.value })}
                    className={`${fieldClass} appearance-none truncate pr-10`}
                  >
                    <option value="">Unassigned</option>
                    {assignableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                </div>
              </div>
            )}

            <fieldset className="min-w-0">
              <legend className={labelClass}>
                Labels <span className={optionalClass}>(optional)</span>
              </legend>
              {labelsError ? (
                <p className={hintClass}>We couldn&apos;t load the labels right now. The template&apos;s labels are left as they are.</p>
              ) : labels === null ? (
                <p className={hintClass}>Loading labels...</p>
              ) : workspaceLabels.length === 0 ? (
                <p className={hintClass}>This workspace has no labels yet. Labels are created from a task or from Manage labels.</p>
              ) : (
                <ul aria-label="Labels to choose from" className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-ink/10 p-1 [scrollbar-width:thin] dark:border-white/10">
                  {workspaceLabels.map((label) => (
                    <li key={label.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-ink/5 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={form.labelIds.includes(label.id)}
                          onChange={(event) =>
                            set({
                              labelIds: event.target.checked
                                ? [...form.labelIds, label.id]
                                : form.labelIds.filter((other) => other !== label.id),
                            })
                          }
                          className="h-5 w-5 shrink-0 rounded border-ink/30 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                        />
                        <LabelChip label={label} />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            <fieldset className="min-w-0">
              <legend className={labelClass}>
                Subtasks <span className={optionalClass}>(optional)</span>
              </legend>
              {form.subtasks.length === 0 ? (
                <p className={hintClass}>No subtasks. A task created from this template starts without any.</p>
              ) : (
                <ol className="space-y-2">
                  {form.subtasks.map((title, index) => (
                    // Rows have no identity of their own; the index is their position, which is what is saved.
                    <li key={index} className="flex items-center gap-1">
                      <input
                        ref={(element) => {
                          subtaskRefs.current[index] = element;
                        }}
                        type="text"
                        value={title}
                        maxLength={TASK_TITLE_MAX_LENGTH}
                        autoComplete="off"
                        aria-label={`Subtask ${index + 1}`}
                        onChange={(event) =>
                          set({ subtasks: form.subtasks.map((other, at) => (at === index ? event.target.value : other)) })
                        }
                        onKeyDown={(event) => {
                          // Enter never submits the form from here; it starts the next subtask.
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSubtask();
                          }
                        }}
                        className={`${fieldClass} min-w-0 flex-1 py-2`}
                      />
                      <button
                        type="button"
                        onClick={() => moveSubtask(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move subtask ${index + 1} up`}
                        className={iconButtonClass}
                      >
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubtask(index, 1)}
                        disabled={index === form.subtasks.length - 1}
                        aria-label={`Move subtask ${index + 1} down`}
                        className={iconButtonClass}
                      >
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => set({ subtasks: form.subtasks.filter((_, at) => at !== index) })}
                        aria-label={`Remove subtask ${index + 1}`}
                        className={`${iconButtonClass} hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300`}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <button
                type="button"
                onClick={addSubtask}
                disabled={form.subtasks.length >= MAX_TEMPLATE_SUBTASKS}
                className={`${secondaryButtonClass} mt-3 px-4`}
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add subtask
              </button>
              {form.subtasks.length >= MAX_TEMPLATE_SUBTASKS && (
                <p className="mt-1 text-xs text-muted dark:text-dark-muted">
                  A template can have at most {MAX_TEMPLATE_SUBTASKS} subtasks.
                </p>
              )}
            </fieldset>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeDialog} disabled={submitting} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              {template ? (submitting ? "Saving..." : "Save changes") : submitting ? "Creating..." : "Create template"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
