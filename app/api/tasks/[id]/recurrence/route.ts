import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateRecurrenceInput } from "@/lib/recurrence-rules";
import { getTaskById, updateTask } from "@/lib/tasks";
import { getSessionUserId, readJson, serverError, taskError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** The task's repeat schedule; `null` when it has never been set to repeat. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const task = await getTaskById(userId, params.id);

    return task ? NextResponse.json({ recurrence: task.recurrence }) : taskNotFound();
  } catch (error) {
    return serverError("load this task's repeat schedule", error);
  }
}

/**
 * Sets the schedule, replacing any the task has (and turning a switched-off one back on). Body:
 * `{ "frequency", "interval"?, "weekdays"?, "monthDay"?, "startDate", "endDate"?, "occurrenceLimit"?, "timeZone"? }`.
 */
async function handlePUT(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateRecurrenceInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // The same path as any other change to the task: updateTask checks access and that the task may repeat.
    const outcome = await updateTask(userId, params.id, { recurrence: result.data });

    return "task" in outcome
      ? NextResponse.json({ recurrence: outcome.task.recurrence, task: outcome.task })
      : taskError(outcome.error);
  } catch (error) {
    return serverError("save this repeat schedule", error);
  }
}

/** Turns repeating off: no further occurrence is created. The settings are kept, and PUT turns it back on. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await updateTask(userId, params.id, { recurrence: null });

    return "task" in outcome ? new NextResponse(null, { status: 204 }) : taskError(outcome.error);
  } catch (error) {
    return serverError("turn off this repeat schedule", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const PUT = withSessionCheck(handlePUT);
export const DELETE = withSessionCheck(handleDELETE);
