"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

import {
  ASSIGNABLE_TEAM_ROLES,
  INVITATION_EMAIL_MAX_LENGTH,
  teamRoleLabels,
  validateInvitationInput,
} from "@/lib/team-validation";

const fieldClass =
  "min-h-11 w-full rounded-lg border border-ink/20 bg-paper px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const labelClass = "mb-2 block text-sm font-medium text-ink dark:text-slate-100";

/** Owner/admin form that creates an invitation, which the server emails; the link is also shown once. */
export default function InviteMemberForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // emailError is the server's reason when the invitation was saved but its email wasn't sent.
  const [created, setCreated] = useState<{ email: string; link: string; emailError: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = validateInvitationInput({ email: formData.get("email"), role: formData.get("role") });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setCreated(null);
    setCopied(false);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/teams/${teamId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
        invitationPath?: unknown;
        emailSent?: unknown;
        emailError?: unknown;
      } | null;

      if (!response.ok || typeof payload?.invitationPath !== "string") {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't create this invitation right now. Please try again.",
        );
        return;
      }

      setCreated({
        email: result.data.email,
        link: `${window.location.origin}${payload.invitationPath}`,
        // Only "sent" when the server says so.
        emailError:
          payload.emailSent === true
            ? null
            : typeof payload.emailError === "string"
              ? payload.emailError
              : "The invitation email could not be sent.",
      });
      form.reset();
      // Shows the new invitation in the pending list.
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!created) {
      return;
    }

    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the link stays selectable in the field.
      setCopied(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-email`} className={labelClass}>
            Email address
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="off"
            maxLength={INVITATION_EMAIL_MAX_LENGTH}
            placeholder="name@example.com"
            aria-describedby={error ? `${id}-error` : undefined}
            className={`${fieldClass} placeholder:text-muted dark:placeholder:text-dark-muted`}
          />
        </div>
        <div className="md:w-40">
          <label htmlFor={`${id}-role`} className={labelClass}>
            Role
          </label>
          <div className="relative">
            <select id={`${id}-role`} name="role" defaultValue="MEMBER" className={`${fieldClass} appearance-none pr-9`}>
              {ASSIGNABLE_TEAM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {teamRoleLabels[role]}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
        >
          {submitting ? "Sending..." : "Send invitation"}
        </button>
      </form>

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {created && (
        <div
          role="status"
          className={`mt-4 rounded-xl border p-4 text-sm text-ink dark:text-slate-100 ${
            created.emailError
              ? "border-accent/40 bg-accent/10"
              : "border-emerald-600/30 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/10"
          }`}
        >
          {created.emailError ? (
            <>
              <p className="font-semibold">Invitation created, but the email was not sent.</p>
              <p className="mt-1 text-muted dark:text-dark-muted">
                {created.emailError} The invitation for{" "}
                <span className="break-all font-medium text-ink dark:text-slate-100">{created.email}</span> is saved:
                use <span className="font-medium text-ink dark:text-slate-100">Resend email</span> under Pending
                invitations to try again, or send them this link yourself.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Invitation emailed.</p>
              <p className="mt-1 text-muted dark:text-dark-muted">
                We sent an invitation link to{" "}
                <span className="break-all font-medium text-ink dark:text-slate-100">{created.email}</span>. You can
                also share this link yourself.
              </p>
            </>
          )}
          <p className="mt-1 text-muted dark:text-dark-muted">
            The link only works for an account with that email address, expires in 7 days, and isn&apos;t shown again.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-link`} className="sr-only">
              Invitation link
            </label>
            <input
              id={`${id}-link`}
              type="text"
              readOnly
              value={created.link}
              onFocus={(event) => event.currentTarget.select()}
              className={`${fieldClass} min-w-0 flex-1 bg-white font-mono text-xs dark:bg-dark-background`}
            />
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
