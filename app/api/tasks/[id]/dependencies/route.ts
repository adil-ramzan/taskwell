import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { addDependency, listDependencies } from "@/lib/dependencies";
import { validateDependencyInput } from "@/lib/task-validation";
import { dependencyError, getSessionUserId, readJson, serverError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** The tasks this one is blocked by, and the tasks it blocks. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const dependencies = await listDependencies(userId, params.id);

    return dependencies ? NextResponse.json(dependencies) : taskNotFound();
  } catch (error) {
    return serverError("load these dependencies", error);
  }
}

/** Body: `{ "relation": "blocked-by" | "blocks", "taskId": "<the other task>" }`. */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateDependencyInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    // addDependency checks access to both tasks, the project, duplicates and cycles.
    const outcome = await addDependency(userId, params.id, result.data);

    return "dependency" in outcome
      ? NextResponse.json({ dependency: outcome.dependency, relation: result.data.relation }, { status: 201 })
      : dependencyError(outcome.error);
  } catch (error) {
    return serverError("add this dependency", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
