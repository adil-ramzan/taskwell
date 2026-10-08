"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { validateTimeZoneInput } from "@/lib/account-validation";
import { errorClass, fieldClass, labelClass, primaryButtonClass, successClass } from "./settings-styles";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";

interface TimeZoneFormProps {
  /** The saved IANA zone, or null. */
  value: string | null;
  /** Every zone the server accepts. */
  zones: string[];
}

/**
 * Picks the account's time zone. The field searches the IANA list as you type
 * (a native datalist); the server checks the choice against the same list.
 */
export default function TimeZoneForm({ value, zones }: TimeZoneFormProps) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [saved, setSaved] = useState(value);
  const [device, setDevice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zones.includes(zone)) setDevice(zone);
  }, [zones]);

  async function save(timeZone: string | null) {
    if (busy.current) {
      return;
    }

    const result = validateTimeZoneInput({ timeZone }, zones);

    if ("error" in result) {
      setStatus({ ok: false, message: result.error });
      return;
    }

    busy.current = true;
    setStatus(null);
    setSaving(true);

    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        setStatus({
          ok: false,
          message: typeof payload?.error === "string" ? payload.error : "We couldn't save your time zone right now. Please try again.",
        });
        return;
      }

      setSaved(result.data.timeZone);
      setDraft(result.data.timeZone ?? "");
      setStatus({ ok: true, message: result.data.timeZone ? `Time zone set to ${result.data.timeZone}.` : "Time zone cleared." });
      router.refresh();
    } catch {
      setStatus({ ok: false, message: "Unable to reach the server. Check your connection and try again." });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(draft.trim() || null);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 px-5 py-5">
      <div>
        <label htmlFor={`${id}-zone`} className={labelClass}>
          Time zone
        </label>
        <input
          id={`${id}-zone`}
          name="timeZone"
          type="text"
          list={`${id}-zones`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search, e.g. Karachi or London"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={status?.ok === false || undefined}
          aria-describedby={`${id}-zone-hint${status ? ` ${id}-zone-status` : ""}`}
          className={fieldClass}
        />
        <datalist id={`${id}-zones`}>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <p id={`${id}-zone-hint`} className="mt-1.5 text-xs text-muted dark:text-dark-muted">
          Currently: <span className="font-medium text-ink dark:text-slate-100">{saved ?? "Not set"}</span>. Used for
          dates on your account; dashboard analytics still count calendar months in UTC.
        </p>
      </div>

      {status && (
        <p id={`${id}-zone-status`} role={status.ok ? "status" : "alert"} className={status.ok ? successClass : errorClass}>
          {status.message}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {device && device !== saved && (
          <button type="button" onClick={() => save(device)} disabled={saving} className={secondaryButtonClass}>
            Use this device&apos;s ({device})
          </button>
        )}
        {saved && (
          <button type="button" onClick={() => save(null)} disabled={saving} className={secondaryButtonClass}>
            Clear
          </button>
        )}
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? "Saving..." : "Save time zone"}
        </button>
      </div>
    </form>
  );
}
