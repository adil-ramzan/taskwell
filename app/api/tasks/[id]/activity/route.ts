import { NextResponse } from "next/server";

import { listTaskActivity } from "@/lib/activity";
import { withSessionCheck } from "@/lib/api";
import { getTaskById } from "@/lib/tasks";
import { getSessionUserId, invalidCursor, serverError, taskNotFound, unauthorized } from "../../_shared";

/**
 * Read-only: the latest 50 activity events, or with `?before=<nextCursor>` the
 * 50 before that. Activity is never created through the API.
 */
async function handleGET(request: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing task and one this user can't access.
    if (!(await getTaskById(userId, params.id))) {
      return taskNotFound();
    }

    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    const page = await listTaskActivity(userId, params.id, before);

    return "error" in page ? invalidCursor() : NextResponse.json(page);
  } catch (error) {
    return serverError("load this activity", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
