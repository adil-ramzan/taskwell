import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { startTimer } from "@/lib/time-tracking";
import { getSessionUserId, serverError, timeError, unauthorized } from "../../../_shared";

type Context = { params: { id: string } };

/**
 * Starts the signed-in user's timer on this task: 201 when it started, 200 when
 * it was already running here. A timer running on another task is stopped
 * first (`stopped` says where and how long). The start time is the server's.
 */
async function handlePOST(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await startTimer(userId, params.id);

    if ("error" in outcome) return timeError(outcome.error);

    return NextResponse.json({ timer: outcome.timer, stopped: outcome.stopped }, { status: outcome.started ? 201 : 200 });
  } catch (error) {
    return serverError("start the timer", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
