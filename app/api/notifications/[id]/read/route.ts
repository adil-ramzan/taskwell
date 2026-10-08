import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { markNotificationRead } from "@/lib/notifications";
import { getSessionUserId, notificationNotFound, serverError, unauthorized } from "../../_shared";

/** Marks one of the signed-in user's notifications as read. Takes no body. */
async function handlePATCH(_request: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Scoped to the session user: someone else's notification ID is "not found".
    return (await markNotificationRead(userId, params.id))
      ? new NextResponse(null, { status: 204 })
      : notificationNotFound();
  } catch (error) {
    return serverError("update this notification", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
