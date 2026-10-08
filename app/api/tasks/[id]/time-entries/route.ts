import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTimeEntryInput } from "@/lib/time-rules";
import { createTimeEntry, getTaskTime } from "@/lib/time-tracking";
import { getSessionUserId, readJson, serverError, taskNotFound, timeError, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** A task's time entries (newest first), the total tracked, and the reader's running timer. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing task and one this user can't access.
    const time = await getTaskTime(userId, params.id);

    return time ? NextResponse.json(time) : taskNotFound();
  } catch (error) {
    return serverError("load this task's time", error);
  }
}

/** Adds a manual entry for the signed-in user. Body: `{ "startedAt": ISO instant, "minutes": 1-1440, "note"?: string }`. */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTimeEntryInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await createTimeEntry(userId, params.id, result.data);

    return "entry" in outcome ? NextResponse.json({ entry: outcome.entry }, { status: 201 }) : timeError(outcome.error);
  } catch (error) {
    return serverError("add this time entry", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
