// Shared by the calendar API, the task form and the calendar UI, so it must stay free of server-only imports.
//
// Calendar days are "YYYY-MM-DD" keys in one IANA time zone (the account's
// preference from Settings, or the browser's when none is set). Instants are
// plain Dates / ISO strings, as stored. Everything here goes through Intl, so
// daylight-saving changes are handled by the zone's own rules.

export const CALENDAR_VIEWS = ["month", "week", "day", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const calendarViewLabels: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

/** How many days the agenda lists from its first day. */
export const AGENDA_DAYS = 30;
/** The longest range the calendar API answers; a month grid is at most 42 days. */
export const MAX_CALENDAR_RANGE_DAYS = 62;
/** Due dates outside these years are rejected, as are calendar ranges. */
export const MIN_CALENDAR_YEAR = 2000;
export const MAX_CALENDAR_YEAR = 2100;

const DAY_MS = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (value: number) => String(value).padStart(2, "0");

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = partsFormatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }

  return formatter;
}

/** True for a name Intl accepts as a time zone. */
export function isValidTimeZone(timeZone: string) {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The wall-clock date and time of an instant in a zone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};

  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const offsetAt = (utc: number, timeZone: string) => {
  const p = zonedParts(new Date(utc), timeZone);

  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utc / 1000) * 1000;
};

/** The instant at which a zone's clocks show this wall time. A time skipped by a clock change moves forward. */
function zonedTimeToInstant(dayKey: string, hour: number, minute: number, timeZone: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - offsetAt(wall, timeZone);
  const second = wall - offsetAt(first, timeZone);
  // The two guesses differ only around a clock change. Whichever one really
  // shows this wall time is the answer (the earlier, if both do).
  const exact = [first, second].filter((guess) => guess + offsetAt(guess, timeZone) === wall);

  // Neither does when the clocks skipped this time; the later guess is the same time after the jump.
  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(first, second));
}

/** The calendar day an instant falls on in a zone. */
export function dayKeyOf(instant: Date, timeZone: string) {
  const { year, month, day } = zonedParts(instant, timeZone);

  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A real calendar date between the supported years, e.g. not "2026-02-30". */
export function isDayKey(value: unknown): value is string {
  const match = typeof value === "string" ? DAY_KEY.exec(value) : null;

  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= MIN_CALENDAR_YEAR &&
    year <= MAX_CALENDAR_YEAR &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Day arithmetic on the calendar itself, so it never depends on a zone or a clock change. */
export function addDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Same day of another month, clamped to that month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dayKey: string, months: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();

  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

/** 0 = Monday ... 6 = Sunday. */
export const weekdayIndex = (dayKey: string) => (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Weeks run Monday to Sunday. */
export const startOfWeek = (dayKey: string) => addDays(dayKey, -weekdayIndex(dayKey));

/** The first instant of a calendar day in a zone (not always 00:00: some zones change clocks at midnight). */
export function startOfDay(dayKey: string, timeZone: string) {
  let instant = zonedTimeToInstant(dayKey, 0, 0, timeZone);

  // Guard for zones whose clock change lands on midnight.
  while (dayKeyOf(instant, timeZone) < dayKey) {
    instant = new Date(instant.getTime() + 15 * 60_000);
  }

  return instant;
}

/** The days a view shows around `anchor`, first to last. */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  let first = anchor;
  let count = 1;

  if (view === "week") {
    first = startOfWeek(anchor);
    count = 7;
  } else if (view === "agenda") {
    count = AGENDA_DAYS;
  } else if (view === "month") {
    const monthStart = `${anchor.slice(0, 8)}01`;
    const monthEnd = addDays(addMonths(monthStart, 1), -1);

    // Whole weeks, so the grid includes the neighbouring months' days.
    first = startOfWeek(monthStart);
    count = Math.round((Date.parse(startOfWeek(monthEnd)) - Date.parse(first)) / DAY_MS) + 7;
  }

  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** The instants that bound a list of consecutive days: [start, end). */
export function rangeOfDays(days: string[], timeZone: string) {
  return {
    start: startOfDay(days[0], timeZone),
    end: startOfDay(addDays(days[days.length - 1], 1), timeZone),
  };
}

/** The day a view moves to with Previous (-1) or Next (1). */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1) {
  if (view === "month") return addMonths(`${anchor.slice(0, 8)}01`, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "agenda") return addDays(anchor, AGENDA_DAYS * direction);

  return addDays(anchor, direction);
}

/*
 * Due dates. A task has one optional instant. Chosen with a time, it is that
 * minute. Chosen as a date only, it is the last second of that day (23:59:59)
 * in the zone it was set in, so the task is due "by the end of" that day and
 * only becomes overdue once the day is over. No extra column records which
 * kind it is: an instant that reads 23:59:59 in the viewer's zone is shown as
 * a date without a time, anything else with its time.
 */

/** The instant for a date and optional "HH:MM" time picked in a zone; null if either is malformed. */
export function dueDateFromInput(dayKey: string, time: string, timeZone: string): Date | null {
  if (!isDayKey(dayKey)) return null;

  if (time === "") {
    return new Date(startOfDay(addDays(dayKey, 1), timeZone).getTime() - 1000);
  }

  const match = TIME.exec(time);

  return match ? zonedTimeToInstant(dayKey, Number(match[1]), Number(match[2]), timeZone) : null;
}

/** The date and time fields that show a stored due date; `time` is "" for a date-only one. */
export function dueDateToInput(value: string | Date, timeZone: string) {
  const parts = zonedParts(new Date(value), timeZone);
  const dateOnly = parts.hour === 23 && parts.minute === 59 && parts.second === 59;

  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: dateOnly ? "" : `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

/** Minutes after midnight in the zone, or null for a date-only due date. Used to order a day's tasks. */
export function dueMinutes(value: string, timeZone: string) {
  const { time } = dueDateToInput(value, timeZone);

  return time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
}

/**
 * Overdue is derived, never stored: the due instant has passed and the task
 * isn't completed. A task's status is not changed by it.
 */
export function isOverdue(task: { dueDate: string | null; status: string }, now: Date) {
  return task.dueDate !== null && task.status !== "COMPLETED" && new Date(task.dueDate).getTime() < now.getTime();
}

/** "2:30 PM" in the zone, or null for a date-only due date. */
export function formatDueTime(value: string, timeZone: string) {
  return dueDateToInput(value, timeZone).time
    ? new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone }).format(new Date(value))
    : null;
}

/** "Oct 10, 2026" or "Oct 10, 2026, 2:30 PM" in the zone. */
export function formatDueDate(value: string, timeZone: string) {
  const dateOnly = !dueDateToInput(value, timeZone).time;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" }),
    timeZone,
  }).format(new Date(value));
}

/** Formats a calendar day (not an instant), e.g. with { weekday: "long", month: "long", day: "numeric" }. */
export function formatDay(dayKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${dayKey}T12:00:00Z`));
}

/** The heading for what a view shows, e.g. "October 2026" or "Oct 5 – 11, 2026". */
export function formatRangeTitle(view: CalendarView, anchor: string) {
  if (view === "month") return formatDay(anchor, { month: "long", year: "numeric" });
  if (view === "day") return formatDay(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const days = visibleDays(view, anchor);
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

  return formatter.formatRange(new Date(`${days[0]}T12:00:00Z`), new Date(`${days[days.length - 1]}T12:00:00Z`));
}
