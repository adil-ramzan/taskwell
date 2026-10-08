"use client";

import { Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { errorClass, fieldClass, labelClass } from "./settings-styles";

const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-dark-surface";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";

interface DeleteAccountSectionProps {
  email: string;
  /** Teams the user owns; deletion is blocked while there are any. */
  ownedTeams: string[];
  twoFactorEnabled: boolean;
}

/** "Delete account": explains what happens, then asks for the email, the password and (with 2FA) a code. */
export default function DeleteAccountSection({ email, ownedTeams, twoFactorEnabled }: DeleteAccountSectionProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState(ownedTeams);

  useEffect(() => setBlockers(ownedTeams), [ownedTeams]);

  function open() {
    setError("");
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;

    const form = new FormData(event.currentTarget);
    const body = { email: form.get("email"), password: form.get("password"), code: form.get("code") ?? undefined };

    if (typeof body.email !== "string" || body.email.trim().toLowerCase() !== email) {
      setError("Type your account's email address exactly to confirm.");
      return;
    }

    if (!body.password) {
      setError("Enter your password.");
      return;
    }

    busy.current = true;
    setError("");
    setDeleting(true);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown; teams?: unknown } | null;

      if (!response.ok) {
        if (Array.isArray(payload?.teams)) setBlockers(payload.teams.filter((team): team is string => typeof team === "string"));
        setError(typeof payload?.error === "string" ? payload.error : "We couldn't delete your account right now. Please try again.");
        busy.current = false;
        setDeleting(false);
        return;
      }

      // The account no longer exists; this also clears the cookie here.
      await signOut({ callbackUrl: "/login?success=account-deleted" });
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
      busy.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-ink/10 px-5 py-5 dark:border-white/10">
      <div>
        <h3 className="text-sm font-semibold text-ink dark:text-slate-100">Delete account</h3>
        <p className="mt-1 text-sm text-muted dark:text-dark-muted">
          Permanently deletes your account, your personal projects and your comments. Team projects you created stay with
          their teams. This can&apos;t be undone.
        </p>
      </div>

      {blockers.length > 0 ? (
        <div role="note" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-ink dark:text-slate-100">
          <p className="font-medium">You can&apos;t delete your account while you own a team.</p>
          <p className="mt-1 text-muted dark:text-dark-muted">
            Ownership can&apos;t be transferred yet, so delete these teams first:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((team) => (
              <li key={team} className="break-words">
                {team}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={open} aria-haspopup="dialog" className={`${dangerButtonClass} w-full sm:w-auto`}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete account
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => deleting && event.preventDefault()}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6">
          <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
            Delete your account?
          </h2>
          <div id={`${id}-description`} className="space-y-2 text-sm text-muted dark:text-dark-muted">
            <p>This permanently deletes your account, your personal projects (with their tasks) and your comments.</p>
            <p>Team projects you created, tasks assigned to you and the activity you recorded stay with their teams, shown as &quot;Deleted user&quot;. You&apos;ll be signed out everywhere.</p>
          </div>
          <div>
            <label htmlFor={`${id}-email`} className={labelClass}>
              Type <span className="break-all font-semibold">{email}</span> to confirm
            </label>
            <input id={`${id}-email`} name="email" type="text" autoComplete="off" spellCheck={false} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${id}-password`} className={labelClass}>
              Password
            </label>
            <input id={`${id}-password`} name="password" type="password" autoComplete="current-password" className={fieldClass} />
          </div>
          {twoFactorEnabled && (
            <div>
              <label htmlFor={`${id}-code`} className={labelClass}>
                Two-factor code or recovery code
              </label>
              <input id={`${id}-code`} name="code" type="text" inputMode="text" autoComplete="one-time-code" className={fieldClass} />
            </div>
          )}
          {error && (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" onClick={() => dialogRef.current?.close()} disabled={deleting} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={deleting} className={dangerButtonClass}>
              {deleting ? "Deleting..." : "Delete my account"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
