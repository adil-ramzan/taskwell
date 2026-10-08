import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateReminderInput } from "@/lib/reminder-rules";
import { addReminder, listReminders } from "@/lib/reminders";
import { getSessionUserId, readJson, serverError, taskError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** The signed-in user's own reminders on this task. Other people's are never listed. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const reminders = await listReminders(userId, params.id);

    return reminders ? NextResponse.json({ reminders }) : taskNotFound();
  } catch (error) {
    return serverError("load your reminders", error);
  }
}

/** Body: `{ "minutesBefore": 5 | 15 | 30 | 60 | 1440, "timeZone"?: string }`. The reminder is always the session user's. */
async function handlePOST(request: Request, { params }: Context) {
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
    // addReminder checks access to the task and that it can still remind.
    const outcome = await addReminder(userId, params.id, result.data);

    return "reminder" in outcome
      ? NextResponse.json({ reminder: outcome.reminder }, { status: 201 })
      : taskError(outcome.error);
  } catch (error) {
    return serverError("add this reminder", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
