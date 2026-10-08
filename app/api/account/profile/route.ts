import { NextResponse } from "next/server";

import { validateProfileInput } from "@/lib/account-validation";
import { withSessionCheck } from "@/lib/api";
import { updateUserName } from "@/lib/users";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../_shared";

/**
 * Updates the signed-in user's profile. The account is always the one in the
 * session; only `name` is read from the body, so userId, email or any other
 * field sent along is ignored.
 */
async function handlePATCH(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateProfileInput(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    return (await updateUserName(userId, result.data.name))
      ? NextResponse.json({ profile: { name: result.data.name } })
      : unauthorized();
  } catch (error) {
    return serverError("save your profile", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
