"use client";

import { useTimeZone } from "./TimeZoneContext";

/**
 * A date in the viewer's locale and the account's time zone (Settings), or the
 * browser's zone when none is saved. `timeZone` overrides both.
 */
export default function FormattedDate({ value, timeZone }: { value: string; timeZone?: string | null }) {
  const accountZone = useTimeZone();
  // UTC until the browser's zone is known, so the server and the first client render agree and the real zone then replaces it.
  const zone = timeZone ?? accountZone ?? "UTC";

  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: zone }).format(new Date(value))}
    </time>
  );
}
