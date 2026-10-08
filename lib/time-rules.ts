// Shared by the time-tracking API and the task page, so it must stay free of server-only imports.
import { isDayKey, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from "@/lib/calendar-dates";

/** The longest a single entry can be. A timer left running is closed at this length when it is stopped. */
export const MAX_ENTRY_SECONDS = 86_400;
export const MAX_ENTRY_MINUTES = MAX_ENTRY_SECONDS / 60;
export const TIME_NOTE_MAX_LENGTH = 500;
/** How many of a task's entries its page lists (the newest); the total always counts all of them. */
export const TIME_ENTRY_PAGE_SIZE = 100;

type ValidationResult<T> = { data: T } | { error: string };

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

// A full ISO instant with an explicit zone, so the server never has to guess one.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function validateStart(value: unknown): ValidationResult<Date> {
  // The date must be a real one: Date.parse would quietly turn 30 February into 2 March.
  const time =
    typeof value === "string" && ISO_INSTANT.test(value) && isDayKey(value.slice(0, 10)) ? Date.parse(value) : NaN;

  if (Number.isNaN(time)) return { error: "Choose a valid start date and time." };

  const date = new Date(Math.floor(time / 1000) * 1000);

  if (date.getUTCFullYear() < MIN_CALENDAR_YEAR || date.getUTCFullYear() > MAX_CALENDAR_YEAR) {
    return { error: `Choose a start between ${MIN_CALENDAR_YEAR} and ${MAX_CALENDAR_YEAR}.` };
  }

  return { data: date };
}

function validateMinutes(value: unknown): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_ENTRY_MINUTES) {
    return { error: "Enter a duration between 1 minute and 24 hours." };
  }

  return { data: value };
}

function validateNote(value: unknown): ValidationResult<string | null> {
  if (value !== undefined && value !== null && typeof value !== "string") return { error: "The note must be text." };

  const note = (value ?? "").trim();

  if (note.length > TIME_NOTE_MAX_LENGTH) return { error: `The note must be ${TIME_NOTE_MAX_LENGTH} characters or fewer.` };

  return { data: note || null };
}

/** A manual entry: when it started and how long it lasted. The end is always worked out on the server. */
export type TimeEntryInput = { startedAt: Date; minutes: number; note: string | null };

export function validateTimeEntryInput(body: unknown): ValidationResult<TimeEntryInput> {
  const payload = asObject(body);

  if (!payload) return { error: "Choose a valid start date and time." };

  const startedAt = validateStart(payload.startedAt);
  if ("error" in startedAt) return startedAt;

  const minutes = validateMinutes(payload.minutes);
  if ("error" in minutes) return minutes;

  const note = validateNote(payload.note);
  if ("error" in note) return note;

  return { data: { startedAt: startedAt.data, minutes: minutes.data, note: note.data } };
}

/** Validates a change to an entry; only the fields present are changed. */
export function validateTimeEntryUpdate(body: unknown): ValidationResult<Partial<TimeEntryInput>> {
  const payload = asObject(body);

  if (!payload) return { error: "Request body must be a JSON object." };

  const data: Partial<TimeEntryInput> = {};

  if ("startedAt" in payload) {
    const startedAt = validateStart(payload.startedAt);
    if ("error" in startedAt) return startedAt;
    data.startedAt = startedAt.data;
  }

  if ("minutes" in payload) {
    const minutes = validateMinutes(payload.minutes);
    if ("error" in minutes) return minutes;
    data.minutes = minutes.data;
  }

  if ("note" in payload) {
    const note = validateNote(payload.note);
    if ("error" in note) return note;
    data.note = note.data;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };

  return { data };
}

/** Whole seconds between two instants, never negative and never more than one entry may hold. */
export function entrySeconds(startedAt: Date, endedAt: Date) {
  return Math.min(MAX_ENTRY_SECONDS, Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)));
}

/** "2h 05m", "45m", "30s", "0m": a length of time as the task page and the reports write it. */
export function formatTracked(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));

  if (total === 0) return "0m";
  if (total < 60) return `${total}s`;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

/** "1:05:09": a running timer's clock. */
export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** "1:30" (hours:minutes, rounded down to the minute) for the CSV export. */
export function formatHoursMinutes(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);

  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
