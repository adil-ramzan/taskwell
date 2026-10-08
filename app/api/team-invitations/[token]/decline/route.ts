import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { declineTeamInvitation } from "@/lib/teams";
import { getSessionUserId, invitationError, serverError, unauthorized } from "../../../teams/_shared";

async function handlePOST(_request: Request, { params }: { params: { token: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await declineTeamInvitation(userId, params.token);

    return "declined" in outcome ? new NextResponse(null, { status: 204 }) : invitationError(outcome.error);
  } catch (error) {
    return serverError("decline this invitation", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
