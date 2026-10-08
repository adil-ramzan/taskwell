import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { deliverInvitationEmail } from "@/lib/invitation-email";
import { getInvitationDelivery } from "@/lib/teams";
import { emailFailureMessage, getSessionUserId, jsonError, serverError, teamError, unauthorized } from "../../../../_shared";

type Context = { params: { teamId: string; invitationId: string } };

/**
 * Sends a pending invitation's email again (owner/admin only). It reuses the
 * existing invitation and link; nothing in the request decides the recipient.
 */
async function handlePOST(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await getInvitationDelivery(userId, params.teamId, params.invitationId);

    if ("error" in outcome) {
      return teamError(outcome.error);
    }

    const email = await deliverInvitationEmail(outcome.delivery);

    return email.sent
      ? NextResponse.json({ emailSent: true, emailSentAt: new Date().toISOString() })
      : jsonError(emailFailureMessage(email.reason), email.reason === "not-configured" ? 503 : 502);
  } catch (error) {
    return serverError("send this invitation", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
