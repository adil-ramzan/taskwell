"use client";

import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";

import { useAssignableMembers } from "./AssignmentContext";
import LabelPicker from "./LabelPicker";
import RecurrenceFields, { NO_REPEAT, repeatFormOf, repeatPayload } from "./RecurrenceFields";
import { useTimeZone } from "./TimeZoneContext";

import { addDays, dayKeyOf, dueDateFromInput, dueDateToInput } from "@/lib/calendar-dates";

import { REMINDER_OFFSETS, reminderOffsetLabels, type ReminderOffset } from "@/lib/reminder-rules";
import type { TemplateSummary } from "@/lib/task-templates";
import type { TaskSummary } from "@/lib/tasks";
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX_LENGTH,
  taskPriorityLabels,
  taskStatusLabels,
  validateTaskInput,
} from "@/lib/task-validation";

const TASKS_PATH = "/dashboard/tasks";
const CALENDAR_PATH = "/dashboard/calendar";
/** The pages under /dashboard/tasks that list tasks; a single task's page is not one of them. */
const LIST_PATHS = [TASKS_PATH, `${TASKS_PATH}/board`, `${TASKS_PATH}/my`];

/** teamId is null for a personal project, whose tasks can't be assigned. */
export type ProjectOption = { id: string; name: string; teamId: string | null };

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";

function SelectField({
  id,
  label,
  name,
  defaultValue,
  required = true,
  onChange,
  children,
}: {
  id: string;
  label: ReactNode;
  name: string;
  defaultValue: string;
  required?: boolean;
  onChange?: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          required={required}
          onChange={onChange && ((event) => onChange(event.target.value))}
          className={`${fieldClass} appearance-none pr-10`}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
        />
      </div>
    </div>
  );
}

interface CreateTaskButtonProps {
  className: string;
  children: ReactNode;
  /** The signed-in user's projects, or null when they couldn't be loaded. */
  projects: ProjectOption[] | null;
  /** When set, the dialog edits this task instead of creating a new one. */
  task?: TaskSummary;
  /** When set, the dialog creates a subtask of this task, in the parent's project. */
  parent?: { id: string; title: string; projectId: string };
  /** A "YYYY-MM-DD" day to offer as the due date of a new task (the calendar's selected day). */
  defaultDueDate?: string;
  /** Called after a successful save, for a caller that loads its own data (the calendar). */
  onSaved?: () => void;
}

/** Lets a parent open the dialog itself (the command palette), without a second form. */
export type CreateDialogHandle = { open: () => void };

/**
 * The single task form, built like CreateProjectButton: a trigger plus a native
 * modal dialog (focus trap, Escape and inertness from showModal()). It creates a
 * task (a subtask, with `parent`), or edits the one passed as `task`.
 */
const CreateTaskButton = forwardRef<CreateDialogHandle, CreateTaskButtonProps>(function CreateTaskButton(
  { className, children, projects, task, parent, defaultDueDate, onSaved },
  ref,
) {
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const hasProjects = projects !== null && projects.length > 0;
  const initialProjectId = task?.project.id ?? parent?.projectId ?? (projects?.length === 1 ? projects[0].id : "");
  // A subtask always lives in its parent's project, so there is no project to choose.
  const projectLocked = Boolean(parent ?? task?.parent);
  const lockedProjectName = projects?.find((project) => project.id === initialProjectId)?.name ?? task?.project.name;
  // Tracked only to know which team's members can be offered as assignee.
  const [projectId, setProjectId] = useState(initialProjectId);
  const selectedTeamId = projects?.find((project) => project.id === projectId)?.teamId;
  // Defined only for a team project in a team where this user is owner or admin.
  const assignableMembers = useAssignableMembers(selectedTeamId);
  // Due dates are entered in the account's time zone (or the browser's when none is saved).
  const timeZone = useTimeZone();
  const [due, setDue] = useState({ date: "", time: "" });
  // An untouched due date is never sent, so saving other fields can't alter it.
  const [dueTouched, setDueTouched] = useState(false);
  // Only a top-level task can repeat. As with the due date, an untouched schedule is never sent.
  const canRepeat = !parent && !task?.parent;
  const [repeat, setRepeat] = useState(NO_REPEAT);
  const [repeatTouched, setRepeatTouched] = useState(false);
  // The user's own reminders on the task, as minutes before the due date. Untouched, they are not sent either.
  const [reminders, setReminders] = useState<ReminderOffset[]>([]);
  const [remindersTouched, setRemindersTouched] = useState(false);
  // The task's labels. Untouched, they are not sent, so the server keeps (or, on a move, sorts out) what is there.
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [labelsTouched, setLabelsTouched] = useState(false);
  // Only a new top-level task can start from a template. The templates are loaded when the dialog opens.
  const canUseTemplate = !task && !parent;
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const template = templates.find((option) => option.id === templateId);

  useEffect(() => {
    if (!open || !canUseTemplate) {
      return;
    }

    let cancelled = false;

    // Optional: if they can't be loaded the form simply offers no templates.
    fetch("/api/task-templates", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { templates?: TemplateSummary[] } | null) => {
        if (!cancelled && Array.isArray(payload?.templates)) setTemplates(payload.templates);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, canUseTemplate]);

  /** Fills the form with a template's values. They stay ordinary fields: everything can still be changed. */
  function applyTemplate(nextId: string) {
    setTemplateId(nextId);

    const chosen = templates.find((option) => option.id === nextId);
    const form = formRef.current;

    if (!chosen || !form) {
      return;
    }

    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;

    for (const [name, value] of [
      ["title", chosen.name],
      ["description", chosen.description ?? ""],
      ["status", chosen.status],
      ["priority", chosen.priority],
    ]) {
      const element = field(name);
      if (element) element.value = value;
    }

    if (chosen.dueOffsetDays !== null && timeZone) {
      setDue({ date: addDays(dayKeyOf(new Date(), timeZone), chosen.dueOffsetDays), time: "" });
    }

    // The label picker reloads for the template and drops the ones that don't exist in the chosen project's workspace.
    setLabelIds(chosen.labels.map((label) => label.id));
    setError("");
  }

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
    setProjectId(initialProjectId);
    setDue(
      task?.dueDate && timeZone
        ? dueDateToInput(task.dueDate, timeZone)
        : { date: (!task && defaultDueDate) || "", time: "" },
    );
    setDueTouched(false);
    setRepeat(repeatFormOf(task?.recurrence));
    setRepeatTouched(false);
    setReminders(task?.reminders.map((reminder) => reminder.minutesBefore) ?? []);
    setRemindersTouched(false);
    setLabelIds(task?.labels.map((label) => label.id) ?? []);
    setLabelsTouched(false);
    setTemplateId("");
    dialogRef.current?.showModal();
    (hasProjects ? titleRef.current : closeRef.current)?.focus();
    setOpen(true);
  }

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
    // A new task sends the prefilled day too; an edit only sends a due date the user changed.
    const sendDue = dueTouched || (!task && due.date !== "");
    let dueDate: string | null = null;

    if (sendDue && (due.date || due.time)) {
      const instant = due.date && timeZone ? dueDateFromInput(due.date, due.time, timeZone) : null;

      if (!instant) {
        setError(due.date ? "Choose a valid due date and time." : "Choose a due date for that time, or clear the time.");
        return;
      }

      dueDate = instant.toISOString();
    }

    // A new task sends its schedule; an edit only a schedule the user changed (null turns repeating off).
    const sendRepeat = canRepeat && (task ? repeatTouched : repeat.frequency !== "");
    const recurrence = sendRepeat ? repeatPayload(repeat, timeZone) : null;

    if (recurrence && "error" in recurrence) {
      setError(recurrence.error);
      return;
    }

    const result = validateTaskInput({
      title: formData.get("title"),
      description: formData.get("description"),
      projectId: formData.get("projectId"),
      status: formData.get("status"),
      priority: formData.get("priority"),
      // Only sent when the assignee field is shown; the server decides whether it is allowed,
      // and clears an assignee that isn't in the new project's team.
      ...(formData.has("assigneeId") ? { assigneeId: formData.get("assigneeId") } : {}),
      ...(sendDue ? { dueDate } : {}),
      ...(recurrence ? { recurrence: recurrence.data } : {}),
      ...((task ? labelsTouched : labelIds.length > 0) ? { labelIds } : {}),
      // A new task sends the reminders that were ticked; an edit only a set the user changed.
      ...((task ? remindersTouched : reminders.length > 0) ? { reminders, ...(timeZone ? { timeZone } : {}) } : {}),
    });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      // From a template, the form's values are sent as they are (also an emptied due date or label list),
      // so the task is exactly what the form shows; the template then only adds its subtasks.
      const fromTemplate = canUseTemplate && template !== undefined;
      const response = await fetch(
        task
          ? `/api/tasks/${task.id}`
          : parent
            ? `/api/tasks/${parent.id}/subtasks`
            : fromTemplate
              ? `/api/task-templates/${template.id}/tasks`
              : "/api/tasks",
        {
          method: task ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            fromTemplate
              ? { ...result.data, dueDate: result.data.dueDate ?? null, labelIds, ...(timeZone ? { timeZone } : {}) }
              : sendRepeat && !recurrence
                ? { ...result.data, recurrence: null }
                : result.data,
          ),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `We couldn't ${task ? "update" : "create"} your ${parent ? "subtask" : "task"} right now. Please try again.`,
        );
        return;
      }

      closeDialog();
      onSaved?.();

      // Re-render the server-loaded data in place, or take the user to the list.
      // refresh() also drops cached copies of the other dashboard pages.
      // A new task stays in place on the pages that list it (the task lists, the board, its project's
      // page, the calendar) and on its parent's page for a subtask. Anywhere else, another task's page
      // included, nothing on screen would show that it was created.
      const listsTasks =
        LIST_PATHS.includes(pathname) || pathname.startsWith("/dashboard/projects/") || pathname === CALENDAR_PATH;

      if (!task && !parent && !listsTasks) {
        router.push(TASKS_PATH);
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
        <form key={task?.updatedAt} ref={formRef} onSubmit={handleSubmit} noValidate className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                {task ? (task.parent ? "Edit subtask" : "Edit task") : parent ? "Add subtask" : "Create task"}
              </h2>
              <p className="mt-1 break-words text-sm text-muted dark:text-dark-muted">
                {task
                  ? `Update this ${task.parent ? "subtask" : "task"}'s details.`
                  : parent
                    ? `A step towards “${parent.title}”. It is a task of its own, with its own status, assignee and due date.`
                    : "Add a task to one of your projects."}
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
                  : "Tasks belong to a project. Create a project first, then add tasks to it."}
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
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="mt-5 space-y-5">
                {canUseTemplate && templates.length > 0 && (
                  <div>
                    <label htmlFor={`${id}-template`} className={labelClass}>
                      Template <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                    </label>
                    <div className="relative">
                      <select
                        id={`${id}-template`}
                        value={templateId}
                        onChange={(event) => applyTemplate(event.target.value)}
                        aria-describedby={`${id}-template-hint`}
                        className={`${fieldClass} appearance-none truncate pr-10`}
                      >
                        <option value="">No template</option>
                        {templates.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.team ? `${option.name} (${option.team.name})` : option.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
                      />
                    </div>
                    <div id={`${id}-template-hint`} role="status" className="mt-1 text-xs text-muted dark:text-dark-muted">
                      {template
                        ? `Filled in from the template; change anything you like.${
                            template.subtasks.length > 0
                              ? ` ${template.subtasks.length} ${template.subtasks.length === 1 ? "subtask is" : "subtasks are"} created with the task.`
                              : ""
                          }`
                        : "Fills in this form with a template's values."}
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor={`${id}-task-title`} className={labelClass}>
                    Title
                  </label>
                  <input
                    ref={titleRef}
                    id={`${id}-task-title`}
                    name="title"
                    type="text"
                    required
                    maxLength={TASK_TITLE_MAX_LENGTH}
                    defaultValue={task?.title}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label htmlFor={`${id}-description`} className={labelClass}>
                    Description <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                  </label>
                  <textarea
                    id={`${id}-description`}
                    name="description"
                    rows={3}
                    maxLength={TASK_DESCRIPTION_MAX_LENGTH}
                    defaultValue={task?.description ?? ""}
                    className={`${fieldClass} resize-y`}
                  />
                </div>

                {projectLocked ? (
                  <div>
                    <input type="hidden" name="projectId" value={initialProjectId} />
                    <p className={labelClass}>Project</p>
                    <p className="break-words text-sm text-muted dark:text-dark-muted">
                      <span className="font-medium text-ink dark:text-slate-100">{lockedProjectName}</span>. A subtask
                      stays in its parent task&apos;s project.
                    </p>
                  </div>
                ) : (
                  <SelectField
                    id={`${id}-project`}
                    label="Project"
                    name="projectId"
                    defaultValue={initialProjectId}
                    onChange={setProjectId}
                  >
                    {projects.length > 1 && !task && (
                      <option value="" disabled>
                        Select a project
                      </option>
                    )}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </SelectField>
                )}

                {assignableMembers && (
                  <SelectField
                    // Remounts with the right default when another project, or a template, is chosen.
                    key={`${projectId}:${templateId}`}
                    id={`${id}-assignee`}
                    label={
                      <>
                        Assignee <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                      </>
                    }
                    name="assigneeId"
                    required={false}
                    defaultValue={
                      task && projectId === task.project.id && task.assignee
                        ? task.assignee.id
                        : template?.assignee && assignableMembers.some((member) => member.id === template.assignee?.id)
                          ? template.assignee.id
                          : ""
                    }
                  >
                    <option value="">Unassigned</option>
                    {assignableMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </SelectField>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField id={`${id}-status`} label="Status" name="status" defaultValue={task?.status ?? "TODO"}>
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabels[status]}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField id={`${id}-priority`} label="Priority" name="priority" defaultValue={task?.priority ?? "MEDIUM"}>
                    {TASK_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {taskPriorityLabels[priority]}
                      </option>
                    ))}
                  </SelectField>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor={`${id}-due-date`} className={labelClass}>
                      Due date <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                    </label>
                    <input
                      id={`${id}-due-date`}
                      type="date"
                      min="2000-01-01"
                      max="2100-12-31"
                      value={due.date}
                      onChange={(event) => {
                        setDue((current) => ({ ...current, date: event.target.value }));
                        setDueTouched(true);
                      }}
                      aria-describedby={`${id}-due-hint`}
                      className={`${fieldClass} min-w-0 dark:[color-scheme:dark]`}
                    />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`${id}-due-time`} className={labelClass}>
                      Due time <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                    </label>
                    <input
                      id={`${id}-due-time`}
                      type="time"
                      value={due.time}
                      onChange={(event) => {
                        setDue((current) => ({ ...current, time: event.target.value }));
                        setDueTouched(true);
                      }}
                      aria-describedby={`${id}-due-hint`}
                      className={`${fieldClass} min-w-0 dark:[color-scheme:dark]`}
                    />
                  </div>
                  <p id={`${id}-due-hint`} className="-mt-3 text-xs text-muted dark:text-dark-muted sm:col-span-2">
                    {timeZone ? `Times are in ${timeZone.replaceAll("_", " ")}. ` : ""}
                    Leave the time empty for a task due any time that day.
                  </p>
                </div>

                <fieldset className="min-w-0">
                  <legend className={labelClass}>
                    Labels <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                  </legend>
                  {/* Only while open: the labels are fetched for the chosen project's workspace. */}
                  {open && (
                    <LabelPicker
                      projectId={projectId}
                      reloadKey={templateId}
                      value={labelIds}
                      onChange={(ids) => {
                        setLabelIds(ids);
                        setLabelsTouched(true);
                      }}
                      disabled={submitting}
                    />
                  )}
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className={labelClass}>
                    Remind me <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
                  </legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {REMINDER_OFFSETS.map((offset) => (
                      <label key={offset} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink dark:text-slate-100">
                        <input
                          type="checkbox"
                          checked={reminders.includes(offset)}
                          onChange={(event) => {
                            setReminders((current) =>
                              event.target.checked
                                ? [...current, offset].sort((a, b) => a - b)
                                : current.filter((other) => other !== offset),
                            );
                            setRemindersTouched(true);
                          }}
                          aria-describedby={`${id}-reminders-hint`}
                          className="h-5 w-5 shrink-0 rounded border-ink/30 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                        />
                        {reminderOffsetLabels[offset]}
                      </label>
                    ))}
                  </div>
                  <p id={`${id}-reminders-hint`} className="mt-1 text-xs text-muted dark:text-dark-muted">
                    A notification for you, before the due date. A reminder needs a due date.
                  </p>
                </fieldset>

                {canRepeat && (
                  <RecurrenceFields
                    id={`${id}-repeat`}
                    value={repeat}
                    onChange={(value) => {
                      setRepeat(value);
                      setRepeatTouched(true);
                    }}
                    defaultStart={due.date || (timeZone ? dayKeyOf(new Date(), timeZone) : "")}
                  />
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} disabled={submitting} className={secondaryButtonClass}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className={primaryButtonClass}>
                  {task
                    ? submitting ? "Saving..." : "Save changes"
                    : parent
                      ? submitting ? "Adding..." : "Add subtask"
                      : submitting ? "Creating..." : "Create task"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
});

export default CreateTaskButton;
