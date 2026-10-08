import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTaskInput } from "@/lib/task-validation";
import { createTask, getTaskById, listSubtasks } from "@/lib/tasks";
import { getSessionUserId, readJson, serverError, taskError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** A task's subtasks, oldest first, with the progress counted from them. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing task and one this user can't access.
    const [task, subtasks] = await Promise.all([getTaskById(userId, params.id), listSubtasks(userId, params.id)]);

    return task ? NextResponse.json({ subtasks, progress: task.subtasks }) : taskNotFound();
  } catch (error) {
    return serverError("load these subtasks", error);
  }
}

/**
 * Creates a subtask of this task. It is an ordinary task; a subtask is then
 * changed and deleted through /api/tasks/:id like any other.
 */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  try {
    const parent = await getTaskById(userId, params.id);

    if (!parent) {
      return taskNotFound();
    }

    const body = parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body) ? parsed.body : {};
    // The parent comes from the address and the project from the parent; whatever the body says for either is replaced.
    const result = validateTaskInput({ ...body, parentTaskId: parent.id, projectId: parent.project.id });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // createTask checks the parent again (top-level, same project) and any assignee.
    const outcome = await createTask(userId, result.data);

    return "task" in outcome ? NextResponse.json({ task: outcome.task }, { status: 201 }) : taskError(outcome.error);
  } catch (error) {
    return serverError("create this subtask", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
