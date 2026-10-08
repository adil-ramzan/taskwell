import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateTimeEntryUpdate } from "@/lib/time-rules";
import { deleteTimeEntry, updateTimeEntry } from "@/lib/time-tracking";
import { getSessionUserId, readJson, serverError, timeError, unauthorized } from "../../../_shared";

type Context = { params: { id: string; entryId: string } };

/** Changes the signed-in user's own finished entry. Body: any of `{ "startedAt", "minutes", "note" }`. */
async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTimeEntryUpdate(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await updateTimeEntry(userId, params.id, params.entryId, result.data);

    return "entry" in outcome ? NextResponse.json({ entry: outcome.entry }) : timeError(outcome.error);
  } catch (error) {
    return serverError("update this time entry", error);
  }
}

/** Deletes an entry: one's own, or anyone's as the team's owner or admin. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteTimeEntry(userId, params.id, params.entryId);

    return "deleted" in outcome ? new NextResponse(null, { status: 204 }) : timeError(outcome.error);
  } catch (error) {
    return serverError("delete this time entry", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
