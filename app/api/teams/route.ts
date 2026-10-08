import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTeamInput } from "@/lib/team-validation";
import { createTeamForUser } from "@/lib/teams";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "./_shared";

async function handlePOST(request: Request) {
  // The creator (and first owner) always comes from the server-side session.
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTeamInput(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    const team = await createTeamForUser(userId, result.data);

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return serverError("create your team", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
