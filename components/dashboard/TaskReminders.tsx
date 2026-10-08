"use client";

import { BellRing, ChevronDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

import { REMINDER_OFFSETS, reminderOffsetLabels, type ReminderOffset } from "@/lib/reminder-rules";
import type { ReminderSummary } from "@/lib/reminders";
import type { TaskSummary } from "@/lib/tasks";
import { useTimeZone } from "./TimeZoneContext";

const selectClass =
  "min-h-11 w-full appearance-none truncate rounded-lg border border-ink/20 bg-white pl-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";
const mutedClass = "text-sm text-muted dark:text-dark-muted";

async function failure(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof payload?.error === "string" ? payload.error : fallback;
}

/** When a reminder fires, always with its time (a due date without a time still reminds at a moment). */
function RemindAt({ value }: { value: string }) {
  const timeZone = useTimeZone();

  return (
    <time dateTime={value}>
      {timeZone
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))
        : "…"}
    </time>
  );
}

function describe(reminder: ReminderSummary) {
  if (!reminder.remindAt) return "Waiting for a due date";

  return reminder.processed ? (
    <>
      Its time has passed (<RemindAt value={reminder.remindAt} />)
    </>
  ) : (
    <>
      Scheduled for <RemindAt value={reminder.remindAt} />
    </>
  );
}

/**
 * The reader's own reminders on a task: when each one fires, a way to remove
 * it, and a way to add another. Reminders are personal, so this card shows a
 * different list to each person who opens the task. The notification itself
 * is sent by the server when the time comes, not by this page.
 */
export default function TaskReminders({ task }: { task: TaskSummary }) {
  const router = useRouter();
  const id = useId();
  const timeZone = useTimeZone();
  const { reminders } = task;
  const unused = REMINDER_OFFSETS.filter((offset) => !reminders.some((reminder) => reminder.minutesBefore === offset));
  const [choice, setChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // The offset shown in the select: the chosen one while it is still free, otherwise the first free one.
  const selected = unused.find((offset) => String(offset) === choice) ?? unused[0];
  const completed = task.status === "COMPLETED";
  const blocked = completed
    ? "A completed task doesn't send reminders. Reopen it to add one."
    : !task.dueDate
      ? "Give this task a due date to add a reminder."
      : "";

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || selected === undefined) return;

    setError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesBefore: selected, ...(timeZone ? { timeZone } : {}) }),
      });

      if (!response.ok) {
        setError(await failure(response, "We couldn't add this reminder right now. Please try again."));
        return;
      }

      setAnnouncement(`Reminder added: ${reminderOffsetLabels[selected]}.`);
      setChoice("");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(reminder: ReminderSummary) {
    setError("");
    setRemoving((current) => new Set(current).add(reminder.id));

    try {
      const response = await fetch(`/api/tasks/${task.id}/reminders/${reminder.id}`, { method: "DELETE" });

      // Already gone (removed in another tab) is what was wanted.
      if (!response.ok && response.status !== 404) {
        setError(await failure(response, "We couldn't remove this reminder right now. Please try again."));
        return;
      }

      setAnnouncement(`Reminder removed: ${reminderOffsetLabels[reminder.minutesBefore]}.`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(reminder.id);
        return next;
      });
    }
  }

  return (
    <>
      <h2 id="task-reminders-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
        Reminders
      </h2>
      <p className={`mt-1 ${mutedClass}`}>
        A notification before this task is due. Reminders are yours alone: nobody else sees them or receives them.
      </p>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {reminders.length === 0 ? (
        <p className={`mt-4 flex items-center gap-2 ${mutedClass}`}>
          <BellRing aria-hidden="true" className="h-4 w-4 shrink-0" />
          You have no reminders for this task.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {reminders.map((reminder) => (
            <li
              key={reminder.id}
              aria-busy={removing.has(reminder.id)}
              className={`flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 dark:border-white/10 ${
                removing.has(reminder.id) ? "opacity-60" : ""
              }`}
            >
              <BellRing aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink dark:text-slate-50">{reminderOffsetLabels[reminder.minutesBefore]}</p>
                <p className="break-words text-xs text-muted dark:text-dark-muted">{describe(reminder)}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(reminder)}
                disabled={removing.has(reminder.id)}
                aria-label={`Remove reminder: ${reminderOffsetLabels[reminder.minutesBefore]}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-progress dark:text-dark-muted dark:hover:bg-red-500/10 dark:hover:text-red-300"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {blocked ? (
        <p className={`mt-4 border-t border-ink/10 pt-4 dark:border-white/10 ${mutedClass}`}>{blocked}</p>
      ) : unused.length === 0 ? (
        <p className={`mt-4 border-t border-ink/10 pt-4 dark:border-white/10 ${mutedClass}`}>
          You have a reminder at every available time.
        </p>
      ) : (
        <form
          onSubmit={add}
          noValidate
          aria-label="Add reminder"
          className="mt-4 grid gap-3 border-t border-ink/10 pt-4 dark:border-white/10 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"
        >
          <div className="min-w-0">
            <label htmlFor={`${id}-offset`} className="mb-1 block text-xs font-medium text-muted dark:text-dark-muted">
              Remind me
            </label>
            <div className="relative">
              <select
                id={`${id}-offset`}
                value={selected}
                disabled={saving}
                onChange={(event) => setChoice(event.target.value)}
                className={selectClass}
              >
                {unused.map((offset: ReminderOffset) => (
                  <option key={offset} value={offset}>
                    {reminderOffsetLabels[offset]}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
          >
            {saving ? "Adding..." : "Add reminder"}
          </button>
        </form>
      )}
    </>
  );
}
