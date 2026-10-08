"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useId, useRef, useState } from "react";

import { NAME_MAX_LENGTH, validateProfileInput } from "@/lib/account-validation";
import { errorClass, fieldClass, labelClass, primaryButtonClass, successClass } from "./settings-styles";

/** Edits the signed-in user's name. The email is shown but can't be changed. */
export default function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // State updates too late to stop clicks fired in the same tick; a ref doesn't.
  const busy = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy.current) {
      return;
    }

    const result = validateProfileInput({ name: value });

    if ("error" in result) {
      setStatus({ ok: false, message: result.error });
      return;
    }

    busy.current = true;
    setStatus(null);
    setSaving(true);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown; profile?: { name?: unknown } } | null;

      if (!response.ok || typeof payload?.profile?.name !== "string") {
        setStatus({
          ok: false,
          message: typeof payload?.error === "string" ? payload.error : "We couldn't save your name right now. Please try again.",
        });
        return;
      }

      setValue(payload.profile.name);
      setStatus({ ok: true, message: "Your name was saved." });
      // Re-renders the sidebar and the rest of the dashboard with the new name.
      router.refresh();
    } catch {
      setStatus({ ok: false, message: "Unable to reach the server. Check your connection and try again." });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 px-5 py-5">
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>
          Name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="name"
          required
          // No maxLength: the browser would cut a pasted name silently; validation says so instead.
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={status?.ok === false || undefined}
          aria-describedby={`${id}-name-hint${status ? ` ${id}-status` : ""}`}
          className={fieldClass}
        />
        <p id={`${id}-name-hint`} className="mt-1.5 text-xs text-muted dark:text-dark-muted">
          Shown to your teammates on tasks, comments and the members list. Up to {NAME_MAX_LENGTH} characters.
        </p>
      </div>

      <div>
        <p className={labelClass} id={`${id}-email-label`}>
          Email
        </p>
        <p
          aria-labelledby={`${id}-email-label`}
          className="break-all rounded-lg border border-ink/10 bg-ink/5 px-4 py-3 text-sm text-ink dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        >
          {email}
        </p>
        <p className="mt-1.5 text-xs text-muted dark:text-dark-muted">
          The email address you sign in with. It can&apos;t be changed here, because Taskwell can&apos;t yet verify a new
          address.
        </p>
      </div>

      {status && (
        <p id={`${id}-status`} role={status.ok ? "status" : "alert"} className={status.ok ? successClass : errorClass}>
          {status.message}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} aria-disabled={saving} className={`${primaryButtonClass} w-full sm:w-auto`}>
          {saving ? "Saving..." : "Save name"}
        </button>
      </div>
    </form>
  );
}
