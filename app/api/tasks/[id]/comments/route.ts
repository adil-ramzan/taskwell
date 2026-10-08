import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateCommentInput } from "@/lib/comment-validation";
import { createComment, listCommentsForTask } from "@/lib/comments";
import {
  commentError,
  getSessionUserId,
  invalidCursor,
  readJson,
  serverError,
  taskNotFound,
  unauthorized,
} from "../../_shared";

type Context = { params: { id: string } };

/** The latest 50 comments, or with `?before=<nextCursor>` the 50 before that. */
async function handleGET(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    // Task access is checked on every page; the cursor only says where to continue.
    const page = await listCommentsForTask(userId, params.id, before);

    if ("error" in page) {
      return page.error === "invalid-cursor" ? invalidCursor() : taskNotFound();
    }

    return NextResponse.json(page);
  } catch (error) {
    return serverError("load these comments", error);
  }
}

async function handlePOST(request: Request, { params }: Context) {
  // The author always comes from the server-side session; any authorId in the body is ignored.
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const result = validateCommentInput(parsed.body);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const outcome = await createComment(userId, params.id, result.data.content);

    return "comment" in outcome
      ? NextResponse.json({ comment: outcome.comment }, { status: 201 })
      : commentError(outcome.error);
  } catch (error) {
    return serverError("add your comment", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
