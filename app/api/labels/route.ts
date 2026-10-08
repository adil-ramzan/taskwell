import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateLabelInput } from "@/lib/label-rules";
import { createLabel, listLabelsForProject, listLabelsForUser } from "@/lib/labels";
import { getSessionUserId, labelError, readJson, serverError, unauthorized } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * The labels the signed-in user can use: their personal ones and those of
 * their teams. With `?projectId=`, only the labels a task of that project can
 * carry (404 when the project doesn't exist or isn't theirs).
 */
async function handleGET(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const projectId = new URL(request.url).searchParams.get("projectId");

    if (projectId) {
      const labels = projectId.length <= 100 ? await listLabelsForProject(userId, projectId) : null;

      return labels ? NextResponse.json({ labels }) : labelError("label-workspace-not-found");
    }

    return NextResponse.json({ labels: await listLabelsForUser(userId) });
  } catch (error) {
    return serverError("load your labels", error);
  }
}

/**
 * Body: `{ "name": string, "color"?: LabelColor, "teamId"?: string, "projectId"?: string }`.
 * With neither a team nor a project the label is one of the user's personal labels.
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

  const result = validateLabelInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // createLabel checks that the user belongs to that team, or can access that project.
    const outcome = await createLabel(userId, result.data);

    return "label" in outcome ? NextResponse.json({ label: outcome.label }, { status: 201 }) : labelError(outcome.error);
  } catch (error) {
    return serverError("create this label", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
