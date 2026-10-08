"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ResendInvitationButtonProps {
  teamId: string;
  invitationId: string;
  email: string;
  /** Whether an email has gone out for this invitation before. */
  sent: boolean;
}

/** Sends a pending invitation's email again. The server picks the recipient from the invitation. */
export default function ResendInvitationButton({ teamId, invitationId, email, sent }: ResendInvitationButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function resend() {
    if (busy) {
      return;
    }

    setResult(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/teams/${teamId}/invitations/${invitationId}/resend`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (response.ok) {
        setResult({ ok: true, message: "Email sent." });
        // Shows the new "Emailed" date.
        router.refresh();
      } else {
        setResult({
          ok: false,
          message: typeof payload?.error === "string" ? payload.error : "The invitation email could not be sent.",
        });
      }
    } catch {
      setResult({ ok: false, message: "Unable to reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        aria-label={`${sent ? "Resend" : "Send"} invitation email to ${email}`}
        className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
        {busy ? "Sending..." : sent ? "Resend email" : "Send email"}
      </button>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`order-last w-full text-xs ${
            result.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
          }`}
        >
          {result.message}
        </p>
      )}
    </>
  );
}
