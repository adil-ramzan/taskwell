import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTeamUpdate } from "@/lib/team-validation";
import { deleteTeamForOwner, updateTeamForUser } from "@/lib/teams";
import { getSessionUserId, jsonError, readJson, serverError, teamError, unauthorized } from "../_shared";

type Context = { params: { teamId: string } };

async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTeamUpdate(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    // Requires owner or admin; checked in updateTeamForUser.
    const outcome = await updateTeamForUser(userId, params.teamId, result.data);

    return "team" in outcome ? NextResponse.json({ team: outcome.team }) : teamError(outcome.error);
  } catch (error) {
    return serverError("update this team", error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Requires owner; checked in deleteTeamForOwner.
    const outcome = await deleteTeamForOwner(userId, params.teamId);

    return "deleted" in outcome ? new NextResponse(null, { status: 204 }) : teamError(outcome.error);
  } catch (error) {
    return serverError("delete this team", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
