import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateMemberRole } from "@/lib/team-validation";
import { removeTeamMember, updateTeamMemberRole } from "@/lib/teams";
import { getSessionUserId, jsonError, readJson, serverError, teamError, unauthorized } from "../../../_shared";

type Context = { params: { teamId: string; memberId: string } };

async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateMemberRole(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    // Who may change whose role is decided in updateTeamMemberRole.
    const outcome = await updateTeamMemberRole(userId, params.teamId, params.memberId, result.data);

    return "updated" in outcome ? NextResponse.json({ role: result.data }) : teamError(outcome.error);
  } catch (error) {
    return serverError("change this member's role", error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await removeTeamMember(userId, params.teamId, params.memberId);

    return "removed" in outcome ? new NextResponse(null, { status: 204 }) : teamError(outcome.error);
  } catch (error) {
    return serverError("remove this member", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
