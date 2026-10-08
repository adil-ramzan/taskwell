import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTaskInput } from "@/lib/task-validation";
import { createTask } from "@/lib/tasks";
import { getSessionUserId, readJson, serverError, taskError, unauthorized } from "./_shared";

async function handlePOST(request: Request) {
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTaskInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // createTask verifies project access, and any assignee, for the session user before inserting.
    const outcome = await createTask(ownerId, result.data);

    return "task" in outcome ? NextResponse.json({ task: outcome.task }, { status: 201 }) : taskError(outcome.error);
  } catch (error) {
    return serverError("create your task", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
