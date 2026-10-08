import { NextResponse } from "next/server";

import { getSessionUserId, jsonError, readJson, serverError, withSessionCheck } from "@/lib/api";
import { validateProjectUpdate } from "@/lib/project-validation";
import { deleteProjectForOwner, updateProjectForOwner } from "@/lib/projects";

type Context = { params: { id: string } };

const unauthorized = () => jsonError("You need to sign in to manage projects.", 401);

function manageError(error: "not-found" | "forbidden") {
  return error === "forbidden"
    ? jsonError("Only team owners and admins can change this team's projects.", 403)
    : // Deliberately identical for "doesn't exist" and "not accessible to this user".
      jsonError("Project not found.", 404);
}

async function handlePATCH(request: Request, { params }: Context) {
  // The user always comes from the server-side session; any ownerId in the request is ignored.
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateProjectUpdate(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    const outcome = await updateProjectForOwner(ownerId, params.id, result.data);

    return "project" in outcome ? NextResponse.json({ project: outcome.project }) : manageError(outcome.error);
  } catch (error) {
    return serverError("projects", "update this project", error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteProjectForOwner(ownerId, params.id);

    return "deleted" in outcome ? new NextResponse(null, { status: 204 }) : manageError(outcome.error);
  } catch (error) {
    return serverError("projects", "delete this project", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
