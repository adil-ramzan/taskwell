// Shared by the task API, the task form and the task page, so it must stay free of server-only imports.
//
// A reminder is an offset before a task's due date. Offsets under a day are
// plain minutes. "1 day before" is a calendar day: the same time on the
// clock one day earlier in the reminder's time zone, so it stays "this time
// yesterday" across a daylight-saving change (23 or 25 hours, not always 24).
import { addDays, dueDateFromInput, isValidTimeZone, zonedParts } from "@/lib/calendar-dates";

/** The offsets a reminder can have, in minutes before the due date. */
export const REMINDER_OFFSETS = [5, 15, 30, 60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/** The most reminders one person can have on one task: one per offset. */
export const MAX_REMINDERS_PER_TASK = REMINDER_OFFSETS.length;

export const reminderOffsetLabels: Record<ReminderOffset, string> = {
  5: "5 minutes before",
  15: "15 minutes before",
  30: "30 minutes before",
  60: "1 hour before",
  1440: "1 day before",
};

const DAY_MINUTES = 1440;
const pad = (value: number) => String(value).padStart(2, "0");

type ValidationResult<T> = { data: T } | { error: string };

export const isReminderOffset = (value: unknown): value is ReminderOffset =>
  typeof value === "number" && REMINDER_OFFSETS.includes(value as ReminderOffset);

const OFFSET_ERROR = `Choose when to be reminded: ${REMINDER_OFFSETS.join(", ")} minutes before the due date.`;

/** An optional IANA zone sent by the browser; only used when the account has none saved. */
function validateZone(value: unknown): ValidationResult<string | undefined> {
  if (value === undefined || value === null || value === "") return { data: undefined };

  if (typeof value !== "string" || value.length > 100 || !isValidTimeZone(value)) {
    return { error: "Choose a valid time zone." };
  }

  return { data: value };
}

export type ReminderInput = { minutesBefore: ReminderOffset; timeZone?: string };

/** Validates `{ "minutesBefore": 15, "timeZone"?: "Asia/Karachi" }`. Whether the task can have a reminder is decided on the server. */
export function validateReminderInput(body: unknown): ValidationResult<ReminderInput> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

  if (!payload || !isReminderOffset(payload.minutesBefore)) {
    return { error: OFFSET_ERROR };
  }

  const zone = validateZone(payload.timeZone);
  if ("error" in zone) return zone;

  return { data: { minutesBefore: payload.minutesBefore, ...(zone.data ? { timeZone: zone.data } : {}) } };
}

/** Validates a whole set of offsets (the task form's checkboxes): a list without repeats, possibly empty. */
export function validateReminderOffsets(value: unknown): ValidationResult<ReminderOffset[]> {
  if (!Array.isArray(value) || value.length > MAX_REMINDERS_PER_TASK || !value.every(isReminderOffset)) {
    return { error: OFFSET_ERROR };
  }

  if (new Set(value).size !== value.length) {
    return { error: "Each reminder time can only be chosen once." };
  }

  return { data: [...value].sort((a, b) => a - b) };
}

export { validateZone as validateReminderTimeZone };

/**
 * The instant a reminder fires: `minutesBefore` before `dueDate`. A whole
 * number of days is counted on the calendar of `timeZone` when there is one
 * (same clock time, that many days earlier); otherwise, and for every shorter
 * offset, it is exact elapsed time.
 */
export function reminderInstant(dueDate: Date | string, minutesBefore: number, timeZone: string | null): Date {
  const due = new Date(dueDate);

  if (timeZone && minutesBefore % DAY_MINUTES === 0) {
    const parts = zonedParts(due, timeZone);
    const day = addDays(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, -minutesBefore / DAY_MINUTES);
    const sameClock = dueDateFromInput(day, `${pad(parts.hour)}:${pad(parts.minute)}`, timeZone);

    if (sameClock) return new Date(sameClock.getTime() + parts.second * 1000 + (due.getTime() % 1000));
  }

  return new Date(due.getTime() - minutesBefore * 60_000);
}
