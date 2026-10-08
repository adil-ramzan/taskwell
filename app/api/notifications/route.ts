import { NextResponse } from "next/server";

import { jsonError, withSessionCheck } from "@/lib/api";
import { listNotifications } from "@/lib/notifications";
import { getSessionUserId, serverError, unauthorized } from "./_shared";

/**
 * The signed-in user's latest 20 notifications, or with `?before=<nextCursor>`
 * the 20 before that, plus their unread count. Whose notifications is decided
 * by the session alone; no user ID is read from the request.
 */
async function handleGET(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    const page = await listNotifications(userId, before);

    return "error" in page ? jsonError("Invalid cursor.", 400) : NextResponse.json(page);
  } catch (error) {
    return serverError("load your notifications", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
