"use client";

import { Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { dayKeyOf, dueDateFromInput, zonedParts } from "@/lib/calendar-dates";
import { formatClock, formatTracked, MAX_ENTRY_MINUTES, TIME_ENTRY_PAGE_SIZE, TIME_NOTE_MAX_LENGTH } from "@/lib/time-rules";
import type { TaskTime, TimeEntrySummary } from "@/lib/time-tracking";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import { deleteIconButtonClass, editIconButtonClass } from "./detail-styles";
import { useTimeZone } from "./TimeZoneContext";
import UserAvatar from "./UserAvatar";

const fieldClass =
  "w-full min-w-0 rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50 dark:[color-scheme:dark]";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";
const mutedClass = "text-sm text-muted dark:text-dark-muted";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const stopButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const errorClass =
  "break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";

const OFFLINE = "Unable to reach the server. Check your connection and try again.";
const pad = (value: number) => String(value).padStart(2, "0");

async function failure(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof payload?.error === "string" ? payload.error : fallback;
}

/** When an entry started, always with its time of day. */
function StartedAt({ value }: { value: string }) {
  const timeZone = useTimeZone();

  return (
    <time dateTime={value}>
      {timeZone
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))
        : "…"}
    </time>
  );
}

/** Seconds since `startedAt` on the server's clock: the browser's own clock only supplies the ticking. */
function useElapsed(startedAt: string | null, serverNow: string) {
  // How far the browser's clock is from the server's, measured once per load of the data.
  const offset = useRef(0);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(null);
      return;
    }

    const started = Date.parse(startedAt);
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() + offset.current - started) / 1000)));

    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [startedAt, serverNow]);

  return elapsed;
}

type EntryForm = { date: string; time: string; hours: string; minutes: string; note: string };

/** The add / edit dialog for a manual entry. The end is never entered: the server works it out from start + duration. */
function EntryDialog({
  taskId,
  entry,
  className,
  label,
  children,
}: {
  taskId: string;
  /** When set, the dialog edits this entry (the user's own) instead of adding one. */
  entry?: TimeEntrySummary;
  className: string;
  label?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const id = useId();
  const timeZone = useTimeZone();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EntryForm>({ date: "", time: "", hours: "", minutes: "", note: "" });
  // An edit only sends what was changed, so a timed entry keeps its seconds when just its note is edited.
  const [touched, setTouched] = useState({ start: false, duration: false });
  const set = (change: Partial<EntryForm>) => setForm((current) => ({ ...current, ...change }));

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
    setTouched({ start: false, duration: false });

    if (entry && timeZone) {
      const parts = zonedParts(new Date(entry.startedAt), timeZone);
      const minutes = Math.floor((entry.seconds ?? 0) / 60);

      setForm({
        date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
        time: `${pad(parts.hour)}:${pad(parts.minute)}`,
        hours: String(Math.floor(minutes / 60)),
        minutes: String(minutes % 60),
        note: entry.note ?? "",
      });
    } else {
      setForm({ date: timeZone ? dayKeyOf(new Date(), timeZone) : "", time: "", hours: "", minutes: "", note: "" });
    }

    dialogRef.current?.showModal();
    dateRef.current?.focus();
    setOpen(true);
  }

  const closeDialog = () => dialogRef.current?.close();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    const body: { startedAt?: string; minutes?: number; note?: string } = { note: form.note };

    if (!entry || touched.start) {
      const start = timeZone && form.date && form.time ? dueDateFromInput(form.date, form.time, timeZone) : null;

      if (!start) {
        setError("Choose the date and the time the work started.");
        return;
      }

      body.startedAt = start.toISOString();
    }

    if (!entry || touched.duration) {
      const whole = (value: string) => (value.trim() === "" ? 0 : /^\d+$/.test(value.trim()) ? Number(value) : NaN);
      const total = whole(form.hours) * 60 + whole(form.minutes);

      if (!Number.isInteger(total) || total < 1 || total > MAX_ENTRY_MINUTES) {
        setError("Enter a duration between 1 minute and 24 hours.");
        return;
      }

      body.minutes = total;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/time-entries${entry ? `/${entry.id}` : ""}`, {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError(await failure(response, `We couldn't ${entry ? "save" : "add"} this time entry right now. Please try again.`));
        return;
      }

      closeDialog();
      router.refresh();
    } catch {
      setError(OFFLINE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" aria-label={label} className={className}>
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
                {entry ? "Edit time entry" : "Add time"}
              </h2>
              <p className={`mt-1 ${mutedClass}`}>
                {entry ? "Change when this work started, how long it took, or its note." : "Time you spent on this task without the timer."}
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
            <p id={`${id}-error`} role="alert" className={`mt-4 ${errorClass}`}>
              {error}
            </p>
          )}

          <div className="mt-5 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={`${id}-date`} className={labelClass}>
                  Date
                </label>
                <input
                  ref={dateRef}
                  id={`${id}-date`}
                  type="date"
                  required
                  min="2000-01-01"
                  max="2100-12-31"
                  value={form.date}
                  onChange={(event) => {
                    set({ date: event.target.value });
                    setTouched((current) => ({ ...current, start: true }));
                  }}
                  aria-describedby={`${id}-zone`}
                  className={fieldClass}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${id}-time`} className={labelClass}>
                  Started at
                </label>
                <input
                  id={`${id}-time`}
                  type="time"
                  required
                  value={form.time}
                  onChange={(event) => {
                    set({ time: event.target.value });
                    setTouched((current) => ({ ...current, start: true }));
                  }}
                  aria-describedby={`${id}-zone`}
                  className={fieldClass}
                />
              </div>
              <p id={`${id}-zone`} className="-mt-3 text-xs text-muted dark:text-dark-muted sm:col-span-2">
                {timeZone ? `Times are in ${timeZone.replaceAll("_", " ")}.` : ""}
              </p>
            </div>

            <fieldset className="min-w-0">
              <legend className={labelClass}>Duration</legend>
              <div className="grid grid-cols-2 gap-5">
                <div className="min-w-0">
                  <label htmlFor={`${id}-hours`} className="mb-1 block text-xs font-medium text-muted dark:text-dark-muted">
                    Hours
                  </label>
                  <input
                    id={`${id}-hours`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    step={1}
                    value={form.hours}
                    onChange={(event) => {
                      set({ hours: event.target.value });
                      setTouched((current) => ({ ...current, duration: true }));
                    }}
                    className={fieldClass}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${id}-minutes`} className="mb-1 block text-xs font-medium text-muted dark:text-dark-muted">
                    Minutes
                  </label>
                  <input
                    id={`${id}-minutes`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    step={1}
                    value={form.minutes}
                    onChange={(event) => {
                      set({ minutes: event.target.value });
                      setTouched((current) => ({ ...current, duration: true }));
                    }}
                    className={fieldClass}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted dark:text-dark-muted">From 1 minute to 24 hours. An entry can&apos;t end in the future.</p>
            </fieldset>

            <div>
              <label htmlFor={`${id}-note`} className={labelClass}>
                Note <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
              </label>
              <input
                id={`${id}-note`}
                type="text"
                autoComplete="off"
                maxLength={TIME_NOTE_MAX_LENGTH}
                value={form.note}
                onChange={(event) => set({ note: event.target.value })}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeDialog} disabled={submitting} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              {entry ? (submitting ? "Saving..." : "Save changes") : submitting ? "Adding..." : "Add time"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * A task's time: the reader's timer (start, stop, the running clock), the
 * total everyone has tracked, and the entries. The server starts and stops
 * the timer and works out every duration; this card only shows them and counts
 * the seconds in between.
 */
export default function TaskTimeTracking({ taskId, time }: { taskId: string; time: TaskTime }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const { running } = time;
  const here = running?.task.id === taskId ? running : null;
  const elsewhere = running && !here ? running : null;
  const elapsed = useElapsed(here?.startedAt ?? null, time.now);

  async function call(path: string, fallback: string, done: string) {
    if (busy) return;

    setError("");
    setBusy(true);

    try {
      const response = await fetch(path, { method: "POST" });

      // Nothing was running any more (stopped in another tab): the page just needs the current state.
      if (!response.ok && response.status !== 409) {
        setError(await failure(response, fallback));
        return;
      }

      setAnnouncement(done);
      router.refresh();
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  const start = () => call(`/api/tasks/${taskId}/timer/start`, "We couldn't start the timer right now. Please try again.", "Timer started.");
  const stop = () => call("/api/timer/stop", "We couldn't stop the timer right now. Please try again.", "Timer stopped.");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="task-time-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Time tracking
          </h2>
          <p className={`mt-1 ${mutedClass}`}>
            Total tracked:{" "}
            <span data-testid="time-total" className="font-medium text-ink dark:text-slate-100">
              {formatTracked(time.totalSeconds)}
            </span>
            {here && " (plus the running timer)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {here ? (
            <button type="button" onClick={stop} disabled={busy} className={stopButtonClass}>
              <Square aria-hidden="true" className="h-4 w-4" />
              Stop timer
            </button>
          ) : (
            <button type="button" onClick={start} disabled={busy} className={primaryButtonClass}>
              <Play aria-hidden="true" className="h-4 w-4" />
              Start timer
            </button>
          )}
          <EntryDialog taskId={taskId} className={secondaryButtonClass}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add time
          </EntryDialog>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {here && (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-ink dark:border-brand/40 dark:bg-brand/10 dark:text-slate-100">
          <span>Your timer is running:</span>
          {/* A timer is not announced every second; the label says what it is when it is read. */}
          <span role="timer" aria-live="off" aria-label="Elapsed time" className="font-display text-xl font-semibold tabular-nums">
            {elapsed === null ? "…" : formatClock(elapsed)}
          </span>
          <span className="text-muted dark:text-dark-muted">
            since <StartedAt value={here.startedAt} />
          </span>
        </p>
      )}

      {elsewhere && (
        <p className={`mt-4 rounded-lg border border-ink/10 bg-paper px-4 py-3 dark:border-white/10 dark:bg-dark-background ${mutedClass}`}>
          Your timer is running on{" "}
          {elsewhere.task.title ? (
            <Link
              href={`/dashboard/tasks/${elsewhere.task.id}`}
              className="break-words font-medium text-brand-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
            >
              {elsewhere.task.title}
            </Link>
          ) : (
            "another task"
          )}
          . Starting it here stops it there and keeps that time.
        </p>
      )}

      {error && (
        <p role="alert" className={`mt-4 ${errorClass}`}>
          {error}
        </p>
      )}

      {time.entries.length === 0 ? (
        <p className={`mt-4 ${mutedClass}`}>No time has been tracked on this task yet.</p>
      ) : (
        <ul aria-label="Time entries" className="mt-4 divide-y divide-ink/10 dark:divide-white/10">
          {time.entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <UserAvatar name={entry.user.name} email={entry.user.email} avatar={entry.user.avatar} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-words text-sm font-medium text-ink dark:text-slate-100">
                  {entry.user.name}
                  {entry.mine && <span className="font-normal text-muted dark:text-dark-muted"> (you)</span>}
                </p>
                <p className="text-xs text-muted dark:text-dark-muted">
                  <StartedAt value={entry.startedAt} /> · {entry.endedAt === null ? "timer" : entry.manual ? "added by hand" : "timer"}
                </p>
                {entry.note && <p className="mt-1 break-words text-sm text-ink [overflow-wrap:anywhere] dark:text-slate-100">{entry.note}</p>}
              </div>
              <p className="text-sm font-semibold tabular-nums text-ink dark:text-slate-50">
                {entry.seconds === null ? <span className="font-medium text-brand-dark dark:text-slate-100">Running</span> : formatTracked(entry.seconds)}
              </p>
              <div className="flex items-center gap-2">
                {entry.canEdit && (
                  <EntryDialog taskId={taskId} entry={entry} className={editIconButtonClass} label="Edit time entry">
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </EntryDialog>
                )}
                {entry.canDelete && (
                  <ConfirmDeleteButton
                    className={deleteIconButtonClass}
                    title="Delete time entry"
                    description={
                      <p>
                        Delete {entry.mine ? "your" : `${entry.user.name}'s`}{" "}
                        {entry.seconds === null ? "running timer" : `time entry of ${formatTracked(entry.seconds)}`}? This can&apos;t be undone.
                      </p>
                    }
                    endpoint={`/api/tasks/${taskId}/time-entries/${entry.id}`}
                    noun="time entry"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">Delete time entry</span>
                  </ConfirmDeleteButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {time.count > time.entries.length && (
        <p className={`mt-3 ${mutedClass}`}>
          Showing the latest {TIME_ENTRY_PAGE_SIZE} of {time.count} entries. The total counts all of them.
        </p>
      )}
    </>
  );
}
