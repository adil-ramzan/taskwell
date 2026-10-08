// Shared by the reports API and the Reports page, so it must stay free of server-only imports.
//
// A report covers whole calendar days, first to last inclusive, in one IANA
// time zone. Days are "YYYY-MM-DD" keys and are turned into instants with
// lib/calendar-dates.ts, so a day is as long as that zone's clocks make it
// (23 or 25 hours when they change).
import { addDays, addMonths, dayKeyOf, isDayKey, startOfDay, startOfWeek } from "@/lib/calendar-dates";

export const REPORT_RANGES = ["today", "7d", "30d", "month", "last-month", "custom"] as const;
export type ReportRangePreset = (typeof REPORT_RANGES)[number];

export const reportRangeLabels: Record<ReportRangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  "last-month": "Last month",
  custom: "Custom range",
};

export const DEFAULT_REPORT_RANGE: ReportRangePreset = "30d";
/** The longest range a report covers, in days (a leap year). */
export const MAX_REPORT_RANGE_DAYS = 366;

/** Which tasks the task table and the CSV list: every matching task, or those with a date in the range. */
export const REPORT_LISTS = ["all", "created", "completed", "due"] as const;
export type ReportList = (typeof REPORT_LISTS)[number];

export const reportListLabels: Record<ReportList, string> = {
  all: "All matching tasks",
  created: "Created in the range",
  completed: "Completed in the range",
  due: "Due in the range",
};

export const REPORT_PAGE_SIZE = 25;
/** The last page the task table answers for; with the page size this bounds how far a request can skip. */
export const REPORT_MAX_PAGE = 400;
/** The most rows one CSV holds; a larger selection is refused rather than cut short. */
export const REPORT_EXPORT_LIMIT = 5000;

const DAY_MS = 86_400_000;

/** How many calendar days `from`..`to` covers, counting both. */
export const daysInRange = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

/** The first and last day of a preset, counted back from `today`. */
export function presetDays(preset: Exclude<ReportRangePreset, "custom">, today: string) {
  const monthStart = `${today.slice(0, 8)}01`;

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      // The whole calendar month, so tasks due later this month are in it.
      return { from: monthStart, to: addDays(addMonths(monthStart, 1), -1) };
    case "last-month":
      return { from: addMonths(monthStart, -1), to: addDays(monthStart, -1) };
  }
}

/** Null when the two days make a usable custom range, otherwise what is wrong with them. */
export function customRangeProblem(from: unknown, to: unknown): string | null {
  if (!isDayKey(from) || !isDayKey(to)) {
    return "Choose a start and an end date, for example 2026-10-01 and 2026-10-31.";
  }

  if (to < from) {
    return "The end date must be on or after the start date.";
  }

  if (daysInRange(from, to) > MAX_REPORT_RANGE_DAYS) {
    return `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days.`;
  }

  return null;
}

export type ReportRange = {
  preset: ReportRangePreset;
  /** First and last calendar day, both included. */
  from: string;
  to: string;
  days: number;
  /** The instants that bound those days in the report's time zone: [start, end). */
  start: Date;
  end: Date;
};

/**
 * The range a report covers. Presets are counted from today in `timeZone`;
 * a custom range uses the two days given. Either way the result is the
 * half-open interval from the first instant of `from` to the first instant
 * of the day after `to` in that zone.
 */
export function resolveReportRange(
  preset: ReportRangePreset,
  custom: { from: unknown; to: unknown },
  timeZone: string,
  now: Date,
): { data: ReportRange } | { error: string } {
  let days: { from: string; to: string };

  if (preset === "custom") {
    const problem = customRangeProblem(custom.from, custom.to);

    if (problem) return { error: problem };

    days = { from: custom.from as string, to: custom.to as string };
  } else {
    days = presetDays(preset, dayKeyOf(now, timeZone));
  }

  return {
    data: {
      preset,
      ...days,
      days: daysInRange(days.from, days.to),
      start: startOfDay(days.from, timeZone),
      end: startOfDay(addDays(days.to, 1), timeZone),
    },
  };
}

export type TrendUnit = "day" | "week" | "month";

/** One bar group of the trend: consecutive days `from`..`to`, both included. */
export type TrendBucket = { from: string; to: string };

/**
 * Splits a range into the periods the trend charts: days up to a month,
 * Monday-to-Sunday weeks up to half a year, calendar months beyond that. The
 * first and last period are cut to the range, so never more than 31 of them.
 */
export function trendBuckets(from: string, to: string): { unit: TrendUnit; buckets: TrendBucket[] } {
  const days = daysInRange(from, to);
  const unit: TrendUnit = days <= 31 ? "day" : days <= 183 ? "week" : "month";
  const buckets: TrendBucket[] = [];
  let day = from;

  while (day <= to) {
    const last =
      unit === "day"
        ? day
        : unit === "week"
          ? addDays(startOfWeek(day), 6)
          : addDays(addMonths(`${day.slice(0, 8)}01`, 1), -1);
    const end = last < to ? last : to;

    buckets.push({ from: day, to: end });
    day = addDays(end, 1);
  }

  return { unit, buckets };
}

/** Looks up which bucket a calendar day belongs to; -1 for a day outside all of them. */
export function bucketIndexer(buckets: TrendBucket[]) {
  const byDay = new Map<string, number>();

  buckets.forEach((bucket, index) => {
    for (let day = bucket.from; day <= bucket.to; day = addDays(day, 1)) byDay.set(day, index);
  });

  return (day: string) => byDay.get(day) ?? -1;
}
