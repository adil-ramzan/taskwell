import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { removeDependency } from "@/lib/dependencies";
import { getTaskById } from "@/lib/tasks";
import { dependencyNotFound, getSessionUserId, serverError, taskNotFound, unauthorized } from "../../../_shared";

/** Removes one of this task's dependencies, whichever side of it the task is on. */
async function handleDELETE(_request: Request, { params }: { params: { id: string; dependencyId: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing task and one this user can't access.
    if (!(await getTaskById(userId, params.id))) {
      return taskNotFound();
    }

    return (await removeDependency(userId, params.id, params.dependencyId))
      ? new NextResponse(null, { status: 204 })
      : dependencyNotFound();
  } catch (error) {
    return serverError("remove this dependency", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const DELETE = withSessionCheck(handleDELETE);
