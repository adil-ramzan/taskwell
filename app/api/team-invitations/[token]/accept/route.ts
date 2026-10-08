import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { acceptTeamInvitation } from "@/lib/teams";
import { getSessionUserId, invitationError, serverError, unauthorized } from "../../../teams/_shared";

async function handlePOST(_request: Request, { params }: { params: { token: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Only the account whose email the invitation was created for can accept it.
    const outcome = await acceptTeamInvitation(userId, params.token);

    return "teamId" in outcome ? NextResponse.json({ teamId: outcome.teamId }) : invitationError(outcome.error);
  } catch (error) {
    return serverError("accept this invitation", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
