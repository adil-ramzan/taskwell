import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { removeTaskLabel } from "@/lib/labels";
import { getSessionUserId, serverError, taskError, unauthorized } from "../../../_shared";

type Context = { params: { id: string; labelId: string } };

/** Takes one label off the task. 404 when the task doesn't carry it. The label itself is not deleted. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await removeTaskLabel(userId, params.id, params.labelId);

    return "labels" in outcome ? NextResponse.json({ labels: outcome.labels }) : taskError(outcome.error);
  } catch (error) {
    return serverError("remove this label", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const DELETE = withSessionCheck(handleDELETE);
