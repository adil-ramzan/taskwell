import { NextResponse } from "next/server";

import { supportedTimeZones, validateTimeZoneInput } from "@/lib/account-validation";
import { withSessionCheck } from "@/lib/api";
import { updateUserTimeZone } from "@/lib/users";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../_shared";

/** Saves the signed-in user's time zone. Only `timeZone` is read from the body. */
async function handlePATCH(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTimeZoneInput(parsed.body, supportedTimeZones());

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    return (await updateUserTimeZone(userId, result.data.timeZone))
      ? NextResponse.json({ preferences: result.data })
      : unauthorized();
  } catch (error) {
    return serverError("save your time zone", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
