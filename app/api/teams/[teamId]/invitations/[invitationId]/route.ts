import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { cancelTeamInvitation } from "@/lib/teams";
import { getSessionUserId, serverError, teamError, unauthorized } from "../../../_shared";

type Context = { params: { teamId: string; invitationId: string } };

/** Cancels a pending invitation (owner/admin only). */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await cancelTeamInvitation(userId, params.teamId, params.invitationId);

    return "cancelled" in outcome ? new NextResponse(null, { status: 204 }) : teamError(outcome.error);
  } catch (error) {
    return serverError("cancel this invitation", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const DELETE = withSessionCheck(handleDELETE);
