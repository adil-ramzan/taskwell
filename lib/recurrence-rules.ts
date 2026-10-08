// Shared by the task API, the task form and the task page, so it must stay free of server-only imports.
//
// A repeat schedule is a grid of calendar days ("YYYY-MM-DD", in the
// schedule's own IANA time zone) counted from its start date, plus an optional
// time of day. All of the arithmetic is on calendar days; a day only becomes
// an instant at the very end, through lib/calendar-dates.ts, so a clock change
// never moves an occurrence to another day or another time on the clock.
import {
  addDays,
  addMonths,
  dayKeyOf,
  dueDateFromInput,
  dueDateToInput,
  isDayKey,
  isValidTimeZone,
  MAX_CALENDAR_YEAR,
  startOfWeek,
  weekdayIndex,
} from "@/lib/calendar-dates";

// The string values mirror the RecurrenceFrequency enum in prisma/schema.prisma.
export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_MAX_INTERVAL = 99;
export const RECURRENCE_MAX_OCCURRENCES = 999;

export const recurrenceFrequencyLabels: Record<RecurrenceFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

/** Index 0 is ISO weekday 1 (Monday). */
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_SHORT_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Which days a schedule falls on. */
export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  /** Every `interval` days, weeks or months, counted from `startDate`. */
  interval: number;
  /** WEEKLY: ISO weekdays, 1 = Monday ... 7 = Sunday, ascending. Empty otherwise. */
  weekdays: number[];
  /** MONTHLY: 1-31; a shorter month uses its last day. Null otherwise. */
  monthDay: number | null;
  /** "YYYY-MM-DD": no occurrence falls before it. */
  startDate: string;
  /** "YYYY-MM-DD", inclusive; null = no end date. */
  endDate: string | null;
  /** The most occurrences the series may have, the first one included; null = no limit. */
  occurrenceLimit: number | null;
};

/** What the API accepts. `timeZone` is only used when the account has no saved zone. */
export type RecurrenceInput = RecurrenceRule & { timeZone?: string };

/** A rule with where it stands: enough to work out the next occurrence. */
export type RecurrenceSchedule = RecurrenceRule & {
  /** Occurrences so far, the current task included. */
  occurrenceCount: number;
  /** "HH:MM" in `timeZone`, or null for a due date without a time. */
  dueTime: string | null;
  timeZone: string;
};

type ValidationResult<T> = { data: T } | { error: string };

const LAST_DAY = `${MAX_CALENDAR_YEAR}-12-31`;

/** ISO weekday of a calendar day: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (dayKey: string) => weekdayIndex(dayKey) + 1;

const dayNumber = (dayKey: string) => Math.round(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);

function wholeNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "string" && /^\d{1,4}$/.test(value.trim()) ? Number(value) : value;

  return typeof number === "number" && Number.isInteger(number) && number >= min && number <= max ? number : null;
}

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/**
 * Validates a schedule's shape. Whether the task may repeat at all (a top-level
 * task that isn't completed, in a project the user can access) is decided on
 * the server in lib/tasks.ts.
 */
export function validateRecurrenceInput(body: unknown): ValidationResult<RecurrenceInput> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

  if (!payload) {
    return { error: "Choose how often this task repeats." };
  }

  const { frequency } = payload;

  if (!RECURRENCE_FREQUENCIES.includes(frequency as RecurrenceFrequency)) {
    return { error: "Choose how often this task repeats: daily, weekly or monthly." };
  }

  const interval = isBlank(payload.interval) ? 1 : wholeNumber(payload.interval, 1, RECURRENCE_MAX_INTERVAL);

  if (interval === null) {
    return { error: `Repeat every 1 to ${RECURRENCE_MAX_INTERVAL} days, weeks or months.` };
  }

  if (!isDayKey(payload.startDate)) {
    return { error: "Choose a valid start date." };
  }

  const startDate = payload.startDate;
  let endDate: string | null = null;

  if (!isBlank(payload.endDate)) {
    if (!isDayKey(payload.endDate)) return { error: "Choose a valid end date." };
    if (payload.endDate < startDate) return { error: "The end date can't be before the start date." };
    endDate = payload.endDate;
  }

  let occurrenceLimit: number | null = null;

  if (!isBlank(payload.occurrenceLimit)) {
    occurrenceLimit = wholeNumber(payload.occurrenceLimit, 1, RECURRENCE_MAX_OCCURRENCES);

    if (occurrenceLimit === null) {
      return { error: `The number of occurrences must be between 1 and ${RECURRENCE_MAX_OCCURRENCES}.` };
    }
  }

  let weekdays: number[] = [];
  let monthDay: number | null = null;

  if (frequency === "WEEKLY") {
    // Left out, a weekly schedule repeats on its start date's weekday.
    const list = isBlank(payload.weekdays) ? [isoWeekday(startDate)] : payload.weekdays;

    if (!Array.isArray(list) || list.length === 0 || list.some((day) => wholeNumber(day, 1, 7) === null)) {
      return { error: "Choose at least one day of the week (1 = Monday to 7 = Sunday)." };
    }

    weekdays = [...new Set(list.map(Number))].sort((a, b) => a - b);
  } else if (frequency === "MONTHLY") {
    // Left out, a monthly schedule repeats on its start date's day of the month.
    monthDay = isBlank(payload.monthDay) ? Number(startDate.slice(8)) : wholeNumber(payload.monthDay, 1, 31);

    if (monthDay === null) {
      return { error: "Choose a day of the month between 1 and 31." };
    }
  }

  const data: RecurrenceInput = {
    frequency: frequency as RecurrenceFrequency,
    interval,
    weekdays,
    monthDay,
    startDate,
    endDate,
    occurrenceLimit,
  };

  if (!isBlank(payload.timeZone)) {
    if (typeof payload.timeZone !== "string" || payload.timeZone.length > 100 || !isValidTimeZone(payload.timeZone)) {
      return { error: "Choose a valid time zone." };
    }

    data.timeZone = payload.timeZone;
  }

  if (endDate !== null && firstOccurrenceDay(data) === null) {
    return { error: "This schedule has no occurrence between its start and end dates." };
  }

  return { data };
}

/** The day a monthly rule falls on, `months` after the start date's month: `monthDay`, or the month's last day when it is shorter. */
function monthlyDay(startDate: string, months: number, monthDay: number) {
  const first = addMonths(`${startDate.slice(0, 8)}01`, months);
  const last = addDays(addMonths(first, 1), -1);
  const wanted = `${first.slice(0, 8)}${String(monthDay).padStart(2, "0")}`;

  return wanted > last ? last : wanted;
}

/**
 * The first day of the rule's grid after `afterDay`, never before the start
 * date. Null when that day would be past the end date or the supported years.
 * The occurrence limit is not looked at here (see nextDueDate).
 */
export function nextOccurrenceDay(rule: RecurrenceRule, afterDay: string): string | null {
  const { startDate, interval } = rule;
  // The earliest day that could qualify.
  const from = afterDay < startDate ? startDate : addDays(afterDay, 1);
  let day: string;

  if (rule.frequency === "DAILY") {
    const steps = Math.ceil((dayNumber(from) - dayNumber(startDate)) / interval);

    day = addDays(startDate, steps * interval);
  } else if (rule.frequency === "WEEKLY") {
    const firstWeek = startOfWeek(startDate);

    day = from;

    // Whole weeks are skipped at once, so this ends within a few steps whatever the interval.
    for (;;) {
      const week = Math.round((dayNumber(startOfWeek(day)) - dayNumber(firstWeek)) / 7);

      if (week % interval !== 0) {
        day = addDays(startOfWeek(day), 7 * (interval - (week % interval)));
      } else if (rule.weekdays.includes(isoWeekday(day))) {
        break;
      } else {
        day = addDays(day, 1);
      }

      if (day > LAST_DAY) return null;
    }
  } else {
    const monthDay = rule.monthDay ?? Number(startDate.slice(8));
    const monthsApart =
      (Number(from.slice(0, 4)) - Number(startDate.slice(0, 4))) * 12 + Number(from.slice(5, 7)) - Number(startDate.slice(5, 7));
    let step = Math.max(0, Math.floor(monthsApart / interval));

    day = monthlyDay(startDate, step * interval, monthDay);

    // The month `from` is in may already be past its day; then it is the next one on the grid.
    while (day < from) {
      step += 1;
      day = monthlyDay(startDate, step * interval, monthDay);
    }
  }

  if (day > LAST_DAY || (rule.endDate !== null && day > rule.endDate)) return null;

  return day;
}

/** The schedule's first day: the first day of its grid on or after the start date. */
export const firstOccurrenceDay = (rule: RecurrenceRule) => nextOccurrenceDay(rule, addDays(rule.startDate, -1));

/** The instant an occurrence on `day` is due: at the schedule's time, or the end of that day without one. */
export const occurrenceDueDate = (day: string, dueTime: string | null, timeZone: string) =>
  dueDateFromInput(day, dueTime ?? "", timeZone);

/** The time of day a due date has in a zone, as the schedule stores it; null for a date without a time. */
export const dueTimeOf = (dueDate: Date | string, timeZone: string) => dueDateToInput(dueDate, timeZone).time || null;

/**
 * The first day on the grid after `afterDay` whose due instant is still ahead
 * of `now`, with that instant. Days that have already gone by are skipped, not
 * queued up, so finishing a task late never produces an overdue occurrence.
 */
export function upcomingOccurrence(
  schedule: Pick<RecurrenceSchedule, keyof RecurrenceRule | "dueTime" | "timeZone">,
  afterDay: string,
  now: Date,
): { day: string; dueDate: Date } | null {
  // No day before today can still be ahead of now, so the search starts there at the earliest.
  const yesterday = addDays(dayKeyOf(now, schedule.timeZone), -1);
  let day = nextOccurrenceDay(schedule, afterDay > yesterday ? afterDay : yesterday);

  while (day !== null) {
    const dueDate = occurrenceDueDate(day, schedule.dueTime, schedule.timeZone);

    if (dueDate && dueDate.getTime() > now.getTime()) return { day, dueDate };

    day = nextOccurrenceDay(schedule, day);
  }

  return null;
}

/**
 * When the occurrence after the current one is due, or null when the series is
 * over (occurrence limit reached, or nothing left on or before the end date).
 * `currentDueDate` is the current occurrence's due date: the next one is the
 * first scheduled day after it. Without one, it is the first scheduled day
 * still ahead.
 */
export function nextDueDate(schedule: RecurrenceSchedule, currentDueDate: Date | string | null, now: Date): Date | null {
  if (schedule.occurrenceLimit !== null && schedule.occurrenceCount >= schedule.occurrenceLimit) {
    return null;
  }

  const afterDay = currentDueDate
    ? dayKeyOf(new Date(currentDueDate), schedule.timeZone)
    : addDays(schedule.startDate, -1);

  return upcomingOccurrence(schedule, afterDay, now)?.dueDate ?? null;
}

const listOf = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "every week on Monday", "every 2 weeks on Monday and Thursday", "every month on day 31". */
export function describeRecurrenceRule(rule: Pick<RecurrenceRule, "frequency" | "interval" | "weekdays" | "monthDay">) {
  const unit = rule.frequency === "DAILY" ? "day" : rule.frequency === "WEEKLY" ? "week" : "month";
  const every = rule.interval === 1 ? `every ${unit}` : `every ${rule.interval} ${unit}s`;

  if (rule.frequency === "WEEKLY" && rule.weekdays.length > 0) {
    return `${every} on ${listOf(rule.weekdays.map((day) => WEEKDAY_NAMES[day - 1]))}`;
  }

  if (rule.frequency === "MONTHLY" && rule.monthDay !== null) {
    return `${every} on day ${rule.monthDay}${rule.monthDay > 28 ? " (or the month's last day)" : ""}`;
  }

  return every;
}

/** "Repeats every week on Monday". */
export const describeRecurrence = (rule: Parameters<typeof describeRecurrenceRule>[0]) =>
  `Repeats ${describeRecurrenceRule(rule)}`;
