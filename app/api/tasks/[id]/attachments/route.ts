import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { ATTACHMENT_MAX_BYTES } from "@/lib/attachment-rules";
import { addAttachment, listAttachments } from "@/lib/attachments";
import { attachmentError, getSessionUserId, serverError, taskNotFound, unauthorized } from "../../_shared";

type Context = { params: { id: string } };

/** A task's attached files, oldest first. */
async function handleGET(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    // Same answer for a missing task and one this user can't access.
    const attachments = await listAttachments(userId, params.id);

    return attachments ? NextResponse.json({ attachments }) : taskNotFound();
  } catch (error) {
    return serverError("load this task's files", error);
  }
}

/**
 * Attaches a file (multipart form, field "file"). The uploader is the session
 * user and the task is the one in the address; the type the browser sent is
 * ignored, and the name is cleaned before it is stored.
 */
async function handlePOST(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  // Refuse big bodies before reading them; the form overhead is allowed for.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > ATTACHMENT_MAX_BYTES + 64 * 1024) {
    return attachmentError("attachment-too-large");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
  }

  if (file.size > ATTACHMENT_MAX_BYTES) {
    return attachmentError("attachment-too-large");
  }

  try {
    const outcome = await addAttachment(userId, params.id, file.name, new Uint8Array(await file.arrayBuffer()));

    return "attachment" in outcome
      ? NextResponse.json({ attachment: outcome.attachment }, { status: 201 })
      : attachmentError(outcome.error);
  } catch (error) {
    return serverError("attach this file", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const POST = withSessionCheck(handlePOST);
