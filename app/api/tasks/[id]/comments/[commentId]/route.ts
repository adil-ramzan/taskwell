import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { validateCommentInput } from "@/lib/comment-validation";
import { deleteComment, updateComment } from "@/lib/comments";
import { commentError, getSessionUserId, readJson, serverError, unauthorized } from "../../../_shared";

type Context = { params: { id: string; commentId: string } };

async function handlePATCH(request: Request, { params }: Context) {
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
    // updateComment checks task access and that the session user wrote the comment.
    const outcome = await updateComment(userId, params.id, params.commentId, result.data.content);

    return "comment" in outcome ? NextResponse.json({ comment: outcome.comment }) : commentError(outcome.error);
  } catch (error) {
    return serverError("update this comment", error);
  }
}

async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // deleteComment allows the author, or an owner/admin of the task's team.
    const outcome = await deleteComment(userId, params.id, params.commentId);

    return "deleted" in outcome ? new NextResponse(null, { status: 204 }) : commentError(outcome.error);
  } catch (error) {
    return serverError("delete this comment", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
