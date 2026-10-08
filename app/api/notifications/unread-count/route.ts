import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { getNotificationPulse } from "@/lib/notifications";
import { getSessionUserId, serverError, unauthorized } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * `{ count, latestId }`: how many unread notifications the signed-in user has
 * and the ID of their newest one. Polled by the bell every few seconds.
 */
async function handleGET() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    return NextResponse.json(await getNotificationPulse(userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError("load your notifications", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
