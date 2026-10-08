import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { deliverInvitationEmail } from "@/lib/invitation-email";
import { validateInvitationInput } from "@/lib/team-validation";
import { inviteTeamMember } from "@/lib/teams";
import {
  emailFailureMessage,
  getSessionUserId,
  jsonError,
  readJson,
  serverError,
  teamError,
  unauthorized,
} from "../../_shared";

type Context = { params: { teamId: string } };

async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateInvitationInput(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    const outcome = await inviteTeamMember(userId, params.teamId, result.data);

    if ("error" in outcome) {
      return teamError(outcome.error);
    }

    // The invitation is saved by now. A failed email never undoes it: the
    // response says so truthfully and the inviter can send it again.
    const email = await deliverInvitationEmail(outcome.delivery).catch((error: unknown) => {
      console.error("[email] Invitation email failed:", error instanceof Error ? error.name : "unknown error");
      return { sent: false as const, reason: "failed" as const };
    });

    // The path is returned once, to the owner/admin who created the invitation,
    // as a fallback they can share themselves.
    return NextResponse.json(
      {
        invitation: { ...outcome.invitation, emailSentAt: email.sent ? new Date().toISOString() : null },
        invitationPath: `/dashboard/teams/invitations/${outcome.token}`,
        emailSent: email.sent,
        ...(email.sent ? {} : { emailError: emailFailureMessage(email.reason) }),
      },
      { status: 201 },
    );
  } catch (error) {
    return serverError("create this invitation", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
