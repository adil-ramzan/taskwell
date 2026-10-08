import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { createTaskFromTemplate } from "@/lib/task-templates";
import { validateTemplateUse } from "@/lib/template-rules";
import { getSessionUserId, readJson, serverError, templateError, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/**
 * Creates a task from this template. Body: `{ "projectId": string, "timeZone"?: string }` plus,
 * optionally, any field of a new task (`title`, `description`, `status`, `priority`, `assigneeId`,
 * `dueDate`, `labelIds`, `recurrence`, `reminders`) to use instead of the template's value.
 * Answers `{ task, subtasks, skipped }`: the new task, how many subtasks it got, and which of
 * the template's defaults were left out because they aren't valid in that project.
 */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTemplateUse(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // Checks the template and the project for the session user, then creates the task as createTask does.
    const outcome = await createTaskFromTemplate(userId, params.id, result.data);

    if ("invalid" in outcome) {
      return NextResponse.json({ error: outcome.invalid }, { status: 400 });
    }

    return "task" in outcome ? NextResponse.json(outcome, { status: 201 }) : templateError(outcome.error);
  } catch (error) {
    return serverError("create a task from this template", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
