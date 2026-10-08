import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { duplicateTemplate } from "@/lib/task-templates";
import { validateTemplateDuplicate } from "@/lib/template-rules";
import { getSessionUserId, serverError, templateError, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/**
 * Copies a template into the same workspace. Body (optional): `{ "name": string }`;
 * without one the copy is named "<name> (copy)".
 */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  // The body is optional, so an empty one is not an error.
  const text = await request.text();
  let body: unknown = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
  }

  const result = validateTemplateDuplicate(body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await duplicateTemplate(userId, params.id, result.data.name);

    return "template" in outcome
      ? NextResponse.json({ template: outcome.template }, { status: 201 })
      : templateError(outcome.error);
  } catch (error) {
    return serverError("duplicate this template", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
