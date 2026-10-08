import { jsonError, serverError as apiServerError } from "@/lib/api";
import type { InvitationProblem } from "@/lib/teams";

export { getSessionUserId, jsonError, readJson } from "@/lib/api";

export const unauthorized = () => jsonError("You need to sign in to manage teams.", 401);

/** Logs the real cause server-side and returns a safe message to the client. */
export const serverError = (action: string, error: unknown) => apiServerError("teams", action, error);

const teamErrors = {
  // Deliberately identical for "doesn't exist" and "not a member".
  "not-found": ["Team not found.", 404],
  forbidden: ["You don't have permission to do that in this team.", 403],
  "member-not-found": ["Member not found.", 404],
  "invitation-not-found": ["Invitation not found.", 404],
  "already-member": ["That person is already a member of this team.", 409],
  "already-invited": ["That email address already has a pending invitation.", 409],
  "invitation-expired": ["This invitation has expired. Cancel it and create a new one.", 410],
  "resend-too-soon": ["This invitation was emailed a moment ago. Wait a minute before sending it again.", 429],
} as const;

export function teamError(code: keyof typeof teamErrors) {
  const [message, status] = teamErrors[code];

  return jsonError(message, status);
}

const invitationErrors: Record<InvitationProblem, readonly [string, number]> = {
  invalid: ["This invitation is not valid.", 404],
  // Same response as an unknown token, so a token can't be tested from another account.
  "wrong-email": ["This invitation is not valid.", 404],
  expired: ["This invitation has expired. Ask a team admin for a new one.", 410],
  accepted: ["This invitation has already been used.", 409],
};

// Shown to the inviter. Neither says anything about the provider or its credentials.
const emailFailures = {
  "not-configured": "Email delivery isn't set up on this server, so no email was sent.",
  failed: "The invitation email could not be sent.",
} as const;

export const emailFailureMessage = (reason: keyof typeof emailFailures) => emailFailures[reason];

export function invitationError(code: InvitationProblem) {
  const [message, status] = invitationErrors[code];

  return jsonError(message, status);
}
