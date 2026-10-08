"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDueDate, isOverdue } from "@/lib/calendar-dates";
import { useTimeZone } from "./TimeZoneContext";

/** A due date as text in the account's time zone ("Oct 10, 2026" or with its time). */
export function DueDateText({ value }: { value: string }) {
  const timeZone = useTimeZone();

  return <time dateTime={value}>{timeZone ? formatDueDate(value, timeZone) : "…"}</time>;
}

/**
 * A task's due date for the detail page, with a written "Overdue" label when
 * it has passed and the task isn't completed. Overdue is derived here from
 * the clock; it is not a status and nothing is saved.
 */
export default function DueDate({ value, status }: { value: string | null; status: string }) {
  // Only known in the browser, so the server render never claims a task is overdue.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, [value]);

  if (!value) {
    return <span className="font-normal italic text-muted dark:text-dark-muted">No due date</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <DueDateText value={value} />
      {now && isOverdue({ dueDate: value, status }, now) && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
          <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
          Overdue
        </span>
      )}
    </span>
  );
}
