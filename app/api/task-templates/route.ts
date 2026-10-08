import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { createTemplate, listTemplatesForUser } from "@/lib/task-templates";
import { validateTemplateInput } from "@/lib/template-rules";
import { getSessionUserId, readJson, serverError, templateError, unauthorized } from "./_shared";

export const dynamic = "force-dynamic";

/** The templates the signed-in user can use: their personal ones and those of their teams. */
async function handleGET() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    return NextResponse.json({ templates: await listTemplatesForUser(userId) });
  } catch (error) {
    return serverError("load your templates", error);
  }
}

/**
 * Body: `{ "name": string, "description"?, "status"?, "priority"?, "dueOffsetDays"?: number | null,
 * "assigneeId"?, "labelIds"?: string[], "subtasks"?: string[], "teamId"?: string }`.
 * Without a team the template is one of the user's personal templates.
 */
async function handlePOST(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTemplateInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // createTemplate checks that the user belongs to that team, and the assignee and labels against it.
    const outcome = await createTemplate(userId, result.data);

    return "template" in outcome
      ? NextResponse.json({ template: outcome.template }, { status: 201 })
      : templateError(outcome.error);
  } catch (error) {
    return serverError("create this template", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
