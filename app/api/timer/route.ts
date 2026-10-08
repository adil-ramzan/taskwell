import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { getRunningTimer } from "@/lib/time-tracking";
import { getSessionUserId, serverError, unauthorized } from "../tasks/_shared";

export const dynamic = "force-dynamic";

/** The signed-in user's running timer, or `null`. `now` is the server's clock, to count from. */
async function handleGET() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    return NextResponse.json({ timer: await getRunningTimer(userId), now: new Date().toISOString() });
  } catch (error) {
    return serverError("load your timer", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
