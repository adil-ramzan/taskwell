import "server-only";

/*
 * Transactional email through Resend's HTTP API. Server-only: the API key is
 * read from the environment here and nowhere else, and never logged.
 *
 *   RESEND_API_KEY  the Resend API key
 *   EMAIL_FROM      the sender, e.g. "Taskwell <invites@example.com>" (a domain verified in Resend)
 *   RESEND_API_URL  optional; only for pointing tests at a local stand-in
 */
const DEFAULT_API_URL = "https://api.resend.com";
const TIMEOUT_MS = 10_000;

export type EmailResult = { sent: true } | { sent: false; reason: "not-configured" | "failed" };

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    console.error("[email] Not sent: RESEND_API_KEY and EMAIL_FROM are not both set.");
    return { sent: false, reason: "not-configured" };
  }

  const baseUrl = (process.env.RESEND_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (response.ok) {
      return { sent: true };
    }

    // Resend's error body has a name and a message; the email itself (and its link) is never logged.
    const problem = (await response.json().catch(() => null)) as { name?: unknown; message?: unknown } | null;
    const detail = [problem?.name, problem?.message].filter((part) => typeof part === "string").join(": ");

    console.error(`[email] Resend rejected the message (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  } catch (error) {
    console.error("[email] Could not reach Resend:", error instanceof Error ? error.name : "unknown error");
  }

  return { sent: false, reason: "failed" };
}
