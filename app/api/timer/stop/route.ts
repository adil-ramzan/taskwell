import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { stopTimer } from "@/lib/time-tracking";
import { getSessionUserId, serverError, timeError, unauthorized } from "../../tasks/_shared";

/**
 * Stops the signed-in user's running timer, whichever task it is on. The
 * duration is worked out on the server; nothing in the request is read.
 */
async function handlePOST() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await stopTimer(userId);

    return "entry" in outcome ? NextResponse.json(outcome) : timeError(outcome.error);
  } catch (error) {
    return serverError("stop your timer", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
