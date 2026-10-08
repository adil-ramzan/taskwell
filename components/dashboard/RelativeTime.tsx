"use client";

import { useEffect, useState } from "react";

import { dayKeyOf } from "@/lib/calendar-dates";
import { useTimeZone } from "./TimeZoneContext";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;

function describe(date: Date, now: Date, timeZone: string, fallback: string) {
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");

  // Calendar days in the account's time zone, so "Yesterday" means what they expect.
  const daysAgo = Math.round((Date.parse(dayKeyOf(now, timeZone)) - Date.parse(dayKeyOf(date, timeZone))) / DAY);

  if (daysAgo <= 0) return plural(Math.floor(elapsed / HOUR), "hour");
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return plural(daysAgo, "day");

  return fallback;
}

/** "Just now", "5 minutes ago", "Yesterday"...; the exact date and time is in the tooltip and for screen readers. */
export default function RelativeTime({ value }: { value: string }) {
  // The account's time zone (Settings), or the browser's when none is saved.
  const timeZone = useTimeZone();
  // UTC until the browser's zone is known, so the server and the first client render agree.
  const zone = timeZone ?? "UTC";
  const date = new Date(value);
  const plain = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: zone }).format(date);
  const exact = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date);
  // Server and first client render show the plain date; the relative text is applied after hydration.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!timeZone) return;

    const update = () => setText(describe(new Date(value), new Date(), timeZone, plain));

    update();
    const timer = window.setInterval(update, MINUTE);

    return () => window.clearInterval(timer);
  }, [value, timeZone, plain]);

  return (
    <time dateTime={value} title={exact} suppressHydrationWarning>
      {text ?? plain}
      <span className="sr-only" suppressHydrationWarning>
        {" "}
        ({exact})
      </span>
    </time>
  );
}
