import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateReminderInput } from "@/lib/reminder-rules";
import { removeReminder, updateReminder } from "@/lib/reminders";
import { getSessionUserId, readJson, serverError, taskError, unauthorized } from "../../../_shared";

type Context = { params: { id: string; reminderId: string } };

/** Changes one of the session user's reminders to another time. Body as for POST. */
async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateReminderInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await updateReminder(userId, params.id, params.reminderId, result.data);

    return "reminder" in outcome ? NextResponse.json({ reminder: outcome.reminder }) : taskError(outcome.error);
  } catch (error) {
    return serverError("change this reminder", error);
  }
}

/** Removes one of the session user's reminders. Someone else's, or one on another task, is a 404. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await removeReminder(userId, params.id, params.reminderId);

    return outcome === "removed" ? new NextResponse(null, { status: 204 }) : taskError(outcome);
  } catch (error) {
    return serverError("remove this reminder", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
