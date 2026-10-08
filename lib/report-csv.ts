// CSV for the report export. No server-only imports, so the escaping can be tested on its own.
import { dueDateToInput, zonedParts } from "@/lib/calendar-dates";

/** The export's columns, always in this order. */
export const REPORT_CSV_COLUMNS = [
  "Task ID",
  "Title",
  "Project",
  "Team",
  "Status",
  "Priority",
  "Assignee",
  "Due date",
  "Created date",
  "Completed date",
  "Time zone",
  "Parent task",
  "Repeating",
  "Time tracked (h:mm)",
] as const;

const pad = (value: number) => String(value).padStart(2, "0");

// A cell a spreadsheet would run as a formula: one that starts with = + - or @
// (also after leading spaces), or with a tab or carriage return.
const FORMULA_START = /^(?:[\t\r]|\s*[=+\-@])/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/**
 * One CSV field. A value that could be read as a formula gets a leading
 * apostrophe, which spreadsheets show as text; then quotes, commas, line
 * breaks and outer spaces are protected by quoting, with quotes doubled.
 */
export function csvCell(value: string) {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;

  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The whole file: a UTF-8 byte order mark (so Excel reads it as UTF-8), the header, then CRLF-ended rows. */
export function toCsv(rows: string[][]) {
  return `﻿${[[...REPORT_CSV_COLUMNS], ...rows].map((row) => `${row.map(csvCell).join(",")}\r\n`).join("")}`;
}

/** "2026-10-06 14:30" on the zone's clock. */
export function csvDateTime(instant: Date, timeZone: string) {
  const parts = zonedParts(instant, timeZone);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** A due date as the app shows it: the day alone when it has no time (lib/calendar-dates.ts), otherwise day and time. */
export function csvDueDate(instant: Date, timeZone: string) {
  const { date, time } = dueDateToInput(instant, timeZone);

  return time ? `${date} ${time}` : date;
}
