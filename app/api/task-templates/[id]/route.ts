import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { deleteTemplate, getTemplateById, updateTemplate } from "@/lib/task-templates";
import { validateTemplateUpdate } from "@/lib/template-rules";
import { getSessionUserId, readJson, serverError, templateError, unauthorized } from "../_shared";

type Context = { params: { id: string } };

async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing template and one this user can't see.
    const template = await getTemplateById(userId, params.id);

    return template ? NextResponse.json({ template }) : templateError("template-not-found");
  } catch (error) {
    return serverError("load this template", error);
  }
}

/** Changes the fields present in the body. A template never changes workspace. */
async function handlePATCH(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateTemplateUpdate(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await updateTemplate(userId, params.id, result.data);

    return "template" in outcome ? NextResponse.json({ template: outcome.template }) : templateError(outcome.error);
  } catch (error) {
    return serverError("update this template", error);
  }
}

/** Deletes a template. Tasks created from it are not affected. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteTemplate(userId, params.id);

    return outcome === "deleted" ? new NextResponse(null, { status: 204 }) : templateError(outcome);
  } catch (error) {
    return serverError("delete this template", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
