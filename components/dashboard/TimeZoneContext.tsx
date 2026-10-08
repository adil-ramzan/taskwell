"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const TimeZoneContext = createContext<string | null>(null);

/**
 * Provided once by the dashboard layout with the account's saved time zone
 * (Settings), or null when none is set.
 */
export function TimeZoneProvider({ value, children }: { value: string | null; children: ReactNode }) {
  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

/**
 * The zone dates are shown and entered in: the saved preference, otherwise the
 * browser's zone. Null until that is known (on the server and during
 * hydration when nothing is saved), so callers never render in the server's zone.
 */
export function useTimeZone() {
  const saved = useContext(TimeZoneContext);
  const [browser, setBrowser] = useState<string | null>(null);

  useEffect(() => {
    setBrowser(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  return saved ?? browser;
}
