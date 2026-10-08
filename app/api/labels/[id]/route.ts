import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateLabelUpdate } from "@/lib/label-rules";
import { deleteLabel, updateLabel } from "@/lib/labels";
import { getSessionUserId, labelError, readJson, serverError, unauthorized } from "../_shared";

type Context = { params: { id: string } };

/** Renames or recolors a label. Body: `{ "name"?: string, "color"?: LabelColor }`. */
async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateLabelUpdate(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await updateLabel(userId, params.id, result.data);

    return "label" in outcome ? NextResponse.json({ label: outcome.label }) : labelError(outcome.error);
  } catch (error) {
    return serverError("update this label", error);
  }
}

/** Deletes a label and takes it off every task that had it. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteLabel(userId, params.id);

    return outcome === "deleted" ? new NextResponse(null, { status: 204 }) : labelError(outcome);
  } catch (error) {
    return serverError("delete this label", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
