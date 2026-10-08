"use client";

import { Pencil, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { dayKeyOf, dueDateToInput, formatDay } from "@/lib/calendar-dates";
import { describeRecurrence, describeRecurrenceRule } from "@/lib/recurrence-rules";
import type { TaskSummary } from "@/lib/tasks";
import { editButtonClass } from "./detail-styles";
import { DueDateText } from "./DueDate";
import RecurrenceFields, { NO_REPEAT, repeatFormOf, repeatPayload } from "./RecurrenceFields";
import { useTimeZone } from "./TimeZoneContext";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const errorClass =
  "break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";

const day = (dayKey: string) => formatDay(dayKey, { month: "short", day: "numeric", year: "numeric" });

async function failure(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof payload?.error === "string" ? payload.error : fallback;
}

/**
 * A top-level task's repeat schedule: what it is, when the next occurrence
 * would be due, and the two things that can be done with it. Editing saves
 * through PUT /api/tasks/:id/recurrence and turning it off through DELETE;
 * the next occurrence itself is created by the server when the task is completed.
 */
export default function TaskRecurrence({ task }: { task: TaskSummary }) {
  const router = useRouter();
  const id = useId();
  const timeZone = useTimeZone();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(NO_REPEAT);
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // Calendar days are formatted in the reader's locale, which is only known in the browser.
  const [mounted, setMounted] = useState(false);
  const { recurrence } = task;
  const active = recurrence?.active === true;
  const completed = task.status === "COMPLETED";

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // The task's own day, or today: what a new schedule starts from.
  const defaultStart = timeZone
    ? task.dueDate
      ? dueDateToInput(task.dueDate, timeZone).date
      : dayKeyOf(new Date(), timeZone)
    : "";

  function openDialog() {
    // A switched-off schedule comes back with its settings, ready to be saved again.
    setForm(repeatFormOf(recurrence, true));
    setDialogError("");
    setError("");
    dialogRef.current?.showModal();
    setOpen(true);
  }

  const closeDialog = () => dialogRef.current?.close();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const payload = repeatPayload(form, timeZone);

    if (!payload) {
      setDialogError("Choose how often this task repeats, or close this and use Disable recurrence.");
      return;
    }

    if ("error" in payload) {
      setDialogError(payload.error);
      return;
    }

    setDialogError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/recurrence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        setDialogError(await failure(response, "We couldn't save this repeat schedule right now. Please try again."));
        return;
      }

      closeDialog();
      setAnnouncement(`This task now ${describeRecurrence(payload.data).toLowerCase()}.`);
      router.refresh();
    } catch {
      setDialogError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (disabling) return;

    setError("");
    setDisabling(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/recurrence`, { method: "DELETE" });

      if (!response.ok) {
        setError(await failure(response, "We couldn't turn off repeating right now. Please try again."));
        return;
      }

      setAnnouncement("Repeating is turned off. No further occurrence will be created.");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setDisabling(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="task-recurrence-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Repeat
          </h2>
          {active && recurrence ? (
            <p className="mt-1 flex items-start gap-2 text-sm font-medium text-ink dark:text-slate-100">
              <Repeat aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <span className="min-w-0 break-words">{describeRecurrence(recurrence)}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted dark:text-dark-muted">
              {recurrence
                ? `Repeating is turned off. It was set to repeat ${describeRecurrenceRule(recurrence)}.`
                : "This task doesn't repeat."}
            </p>
          )}
        </div>
        {/* A completed task can't start repeating; the server refuses it too. */}
        {!completed && (
          <div className="flex shrink-0 flex-col gap-3 min-[400px]:flex-row">
            <button type="button" onClick={openDialog} aria-haspopup="dialog" className={editButtonClass}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
              {recurrence ? "Edit recurrence" : "Set up recurrence"}
            </button>
            {active && (
              <button type="button" onClick={() => void disable()} disabled={disabling} className={secondaryButtonClass}>
                {disabling ? "Turning off..." : "Disable recurrence"}
              </button>
            )}
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && (
        <p role="alert" className={`mt-4 ${errorClass}`}>
          {error}
        </p>
      )}

      {active && recurrence && (
        <dl className="mt-4 grid gap-x-4 gap-y-4 border-t border-ink/10 pt-4 text-sm dark:border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted dark:text-dark-muted">Next occurrence</dt>
            <dd className="mt-1 font-medium text-ink dark:text-slate-100">
              {recurrence.nextDueDate ? (
                <>
                  Due <DueDateText value={recurrence.nextDueDate} />
                </>
              ) : (
                "None: this is the last one"
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted dark:text-dark-muted">Starts</dt>
            <dd className="mt-1 font-medium text-ink dark:text-slate-100">{mounted ? day(recurrence.startDate) : "…"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted dark:text-dark-muted">Ends</dt>
            <dd className="mt-1 font-medium text-ink dark:text-slate-100">
              {recurrence.endDate ? (mounted ? day(recurrence.endDate) : "…") : "No end date"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted dark:text-dark-muted">Occurrence</dt>
            <dd className="mt-1 font-medium text-ink dark:text-slate-100">
              {recurrence.occurrenceCount}
              {recurrence.occurrenceLimit !== null ? ` of ${recurrence.occurrenceLimit}` : ""}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-4 text-sm text-muted dark:text-dark-muted">
        {active && recurrence
          ? `${
              completed
                ? "This task is completed and its series is over."
                : "Completing this task creates the next one, with the same title, description, priority, project and assignee."
            } Subtasks, dependencies and comments aren't copied. Dates follow ${recurrence.timeZone.replaceAll("_", " ")} time.`
          : completed
            ? "A completed task can't be set to repeat. Reopen it first."
            : "A repeating task is created again, with a new due date, each time it is completed."}
      </p>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !saving) closeDialog();
        }}
        onCancel={(event) => {
          if (saving) event.preventDefault();
        }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <form onSubmit={save} noValidate className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                {recurrence ? "Edit recurrence" : "Set up recurrence"}
              </h2>
              <p className="mt-1 break-words text-sm text-muted dark:text-dark-muted">
                How often “{task.title}” comes back after it is completed.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={saving}
              aria-label="Close"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {dialogError && (
            <p role="alert" className={`mt-4 ${errorClass}`}>
              {dialogError}
            </p>
          )}

          <div className="mt-5">
            {/* Mounted only while open, so it always starts from the saved schedule. */}
            {open && (
              <RecurrenceFields id={`${id}-repeat`} value={form} onChange={setForm} defaultStart={defaultStart} disabled={saving} />
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeDialog} disabled={saving} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "Saving..." : "Save recurrence"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
