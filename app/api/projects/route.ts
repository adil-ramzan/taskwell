import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUserId, jsonError, readJson, serverError, withSessionCheck } from "@/lib/api";
import { validateProjectInput } from "@/lib/project-validation";
import { createProjectForOwner } from "@/lib/projects";

async function handlePOST(request: Request) {
  // The owner always comes from the server-side session; any ownerId in the body is ignored.
  const ownerId = await getSessionUserId();

  if (!ownerId) {
    return jsonError("You need to sign in to create a project.", 401);
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateProjectInput(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  try {
    // For a team project, createProjectForOwner checks the user's role in that team.
    const outcome = await createProjectForOwner(ownerId, result.data);

    if ("project" in outcome) {
      return NextResponse.json({ project: outcome.project }, { status: 201 });
    }

    return outcome.error === "forbidden"
      ? jsonError("Only team owners and admins can create projects in this team.", 403)
      : jsonError("Choose one of your teams for this project.", 404);
  } catch (error) {
    // The session refers to a user that no longer exists.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return jsonError("Your session has expired. Please sign in again.", 401);
    }

    return serverError("projects", "create your project", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
