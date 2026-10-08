"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface InvitationActionsProps {
  /** The signed-in user's own invitation token. */
  token: string;
  teamName: string;
  /** Where to go after declining; omit to refresh the current page. */
  declineRedirectTo?: string;
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70";

/** Accept / Decline for an invitation addressed to the signed-in user. */
export default function InvitationActions({ token, teamName, declineRedirectTo }: InvitationActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    if (busy) {
      return;
    }

    setError("");
    setBusy(action);

    try {
      const response = await fetch(`/api/team-invitations/${encodeURIComponent(token)}/${action}`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown; teamId?: unknown } | null;

      if (!response.ok) {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `We couldn't ${action} this invitation right now. Please try again.`,
        );
        setBusy(null);
        return;
      }

      // Stays busy until the page is replaced or re-rendered without this invitation.
      if (action === "accept" && typeof payload?.teamId === "string") {
        router.push(`/dashboard/teams/${payload.teamId}`);
      } else if (declineRedirectTo) {
        router.replace(declineRedirectTo);
      }

      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={busy !== null}
          aria-label={`Accept invitation to ${teamName}`}
          className={`${buttonBase} bg-brand font-semibold text-white hover:bg-brand-dark focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface`}
        >
          {busy === "accept" ? "Joining..." : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={busy !== null}
          aria-label={`Decline invitation to ${teamName}`}
          className={`${buttonBase} border border-ink/15 bg-white font-medium text-ink hover:border-brand hover:text-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100`}
        >
          {busy === "decline" ? "Declining..." : "Decline"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
