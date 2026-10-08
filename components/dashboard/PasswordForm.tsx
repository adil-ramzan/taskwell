"use client";

import { signOut } from "next-auth/react";
import { FormEvent, useId, useRef, useState } from "react";

import { PASSWORD_MIN_LENGTH, validatePasswordChangeInput } from "@/lib/account-validation";
import { errorClass, fieldClass, labelClass, primaryButtonClass, successClass } from "./settings-styles";

const fields = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
] as const;

/**
 * Changes the password. The server signs the account out everywhere when it
 * succeeds; this form then clears this browser's cookie and goes to the login page.
 */
export default function PasswordForm() {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  // State updates too late to stop clicks fired in the same tick; a ref doesn't.
  const busy = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy.current) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = Object.fromEntries(fields.map(({ name }) => [name, formData.get(name)]));
    const result = validatePasswordChangeInput(body);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    busy.current = true;
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        setError(
          typeof payload?.error === "string" ? payload.error : "We couldn't change your password right now. Please try again.",
        );
        busy.current = false;
        setSaving(false);
        return;
      }

      // Stays busy: the page is about to go to the login screen.
      form.reset();
      setDone(true);
      // The session is already invalid on the server; this also removes the cookie here.
      await signOut({ callbackUrl: "/login?success=password-changed" });
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 px-5 py-5">
      <p id={`${id}-note`} className="text-sm text-muted dark:text-dark-muted">
        Your new password needs at least {PASSWORD_MIN_LENGTH} characters. Changing it signs you out on every device,
        including this one; you&apos;ll then log in with the new password.
      </p>

      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={`${id}-${field.name}`} className={labelClass}>
            {field.label}
          </label>
          <input
            id={`${id}-${field.name}`}
            name={field.name}
            type="password"
            autoComplete={field.autoComplete}
            required
            minLength={field.name === "currentPassword" ? undefined : PASSWORD_MIN_LENGTH}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={fieldClass}
          />
        </div>
      ))}

      {error && (
        <p id={`${id}-error`} role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {done && (
        <p role="status" className={successClass}>
          Password changed. Signing you out...
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || done}
          aria-disabled={saving || done}
          className={`${primaryButtonClass} w-full sm:w-auto`}
        >
          {saving || done ? "Changing..." : "Change password"}
        </button>
      </div>
    </form>
  );
}
