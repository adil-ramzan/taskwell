import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateLabelId, validateLabelIds } from "@/lib/label-rules";
import { addTaskLabel, listTaskLabels } from "@/lib/labels";
import { updateTask } from "@/lib/tasks";
import { getSessionUserId, readJson, serverError, taskError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** The task's labels, by name. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const labels = await listTaskLabels(userId, params.id);

    return labels ? NextResponse.json({ labels }) : taskNotFound();
  } catch (error) {
    return serverError("load this task's labels", error);
  }
}

/** Adds one label. Body: `{ "labelId": "<id>" }`. Adding one the task already has is not an error. */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateLabelId(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // addTaskLabel checks access to the task and that the label is of the task's workspace.
    const outcome = await addTaskLabel(userId, params.id, result.data);

    return "labels" in outcome ? NextResponse.json({ labels: outcome.labels }) : taskError(outcome.error);
  } catch (error) {
    return serverError("add this label", error);
  }
}

/** Replaces the task's labels. Body: `{ "labelIds": string[] }`; an empty list removes them all. */
async function handlePUT(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const body = parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body) ? parsed.body : {};
  const result = validateLabelIds((body as { labelIds?: unknown }).labelIds);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // The same path as any other change to the task.
    const outcome = await updateTask(userId, params.id, { labelIds: result.data });

    return "task" in outcome ? NextResponse.json({ labels: outcome.task.labels }) : taskError(outcome.error);
  } catch (error) {
    return serverError("save this task's labels", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
export const PUT = withSessionCheck(handlePUT);
