import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTaskUpdate } from "@/lib/task-validation";
import { deleteTask, getTaskById, updateTask } from "@/lib/tasks";
import { getSessionUserId, hasSubtasks, readJson, serverError, taskError, taskNotFound, unauthorized } from "../_shared";

type Context = { params: { id: string } };

async function handleGET(_request: Request, { params }: Context) {
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  try {
    const task = await getTaskById(ownerId, params.id);

    return task ? NextResponse.json({ task }) : taskNotFound();
  } catch (error) {
    return serverError("load this task", error);
  }
}

async function handlePATCH(request: Request, { params }: Context) {
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTaskUpdate(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await updateTask(ownerId, params.id, result.data);

    // updateTask also decides whether the assignee may change, from the task's project.
    return "task" in outcome ? NextResponse.json({ task: outcome.task }) : taskError(outcome.error);
  } catch (error) {
    return serverError("update this task", error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteTask(ownerId, params.id);

    return outcome === "deleted"
      ? new NextResponse(null, { status: 204 })
      : outcome === "has-subtasks"
        ? hasSubtasks()
        : taskNotFound();
  } catch (error) {
    return serverError("delete this task", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
