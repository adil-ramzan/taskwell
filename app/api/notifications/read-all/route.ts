import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { markAllNotificationsRead } from "@/lib/notifications";
import { getSessionUserId, serverError, unauthorized } from "../_shared";

/** Marks all of the signed-in user's notifications as read. Takes no body. */
async function handlePOST() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    return NextResponse.json({ updated: await markAllNotificationsRead(userId) });
  } catch (error) {
    return serverError("update your notifications", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
