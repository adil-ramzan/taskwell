import { NextResponse } from "next/server";

import { getSessionUserId, jsonError, serverError, withSessionCheck } from "@/lib/api";
import { listCalendarTasks, parseCalendarQuery } from "@/lib/calendar";

// Always answered for the current session; never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/calendar?start=&end=[&scope=&teamId=&projectId=&assignee=&status=&priority=]
 * Tasks due in [start, end) that the signed-in user can access.
 */
async function handleGET(request: Request) {
  // The only identity used: IDs in the query string filter, they never grant access.
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("You need to sign in to view your calendar.", 401);
  }

  const query = parseCalendarQuery(new URL(request.url).searchParams);

  if ("error" in query) {
    return jsonError(query.error, 400);
  }

  try {
    return NextResponse.json(await listCalendarTasks(userId, query.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return serverError("calendar", "load your calendar", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
