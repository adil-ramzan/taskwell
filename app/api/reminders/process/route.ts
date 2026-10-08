import { NextResponse } from "next/server";

import { getSessionUserId, serverError as apiServerError, withSessionCheck } from "@/lib/api";
import { processDueReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * Sends the signed-in user's own reminders that are due right now, without
 * waiting for the scheduler's next tick. It can only ever touch the caller's
 * reminders (the user comes from the session; the body is not read), and it is
 * the same idempotent step the scheduler runs, so calling it any number of
 * times, alongside the scheduler or not, sends each reminder once.
 */
async function handlePOST() {
  const userId = await getSessionUserId();

  if (!userId) {
    return NextResponse.json({ error: "You need to sign in to process reminders." }, { status: 401 });
  }

  try {
    return NextResponse.json(await processDueReminders(new Date(), userId));
  } catch (error) {
    return apiServerError("reminders", "process your reminders", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
