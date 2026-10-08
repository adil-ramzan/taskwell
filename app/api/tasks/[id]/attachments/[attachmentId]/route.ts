import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { deleteAttachment, readAttachment } from "@/lib/attachments";
import { attachmentError, getSessionUserId, serverError, unauthorized } from "../../../_shared";

type Context = { params: { id: string; attachmentId: string } };

/** A file name for Content-Disposition: an ASCII fallback plus the real name, percent-encoded (RFC 5987). */
function disposition(kind: "inline" | "attachment", name: string) {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/**
 * Sends the file to someone who can open its task. Images may be
 * shown in a tab; with `?download=1`, and for every other type, it is a
 * download. The type is the one the server stored, the browser is told not to
 * guess another, and nothing in the file can run or load anything.
 */
async function handleGET(request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const file = await readAttachment(userId, params.id, params.attachmentId);

    if ("error" in file) return attachmentError(file.error);

    const inline = file.inline && new URL(request.url).searchParams.get("download") !== "1";

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": disposition(inline ? "inline" : "attachment", file.name),
        // Access is decided per request, so nothing may keep a copy to hand out later.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return serverError("load this file", error);
  }
}

/** Deletes an attachment: one's own, or anyone's as the team's owner or admin. */
async function handleDELETE(_request: Request, { params }: Context) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const outcome = await deleteAttachment(userId, params.id, params.attachmentId);

    return "deleted" in outcome ? new NextResponse(null, { status: 204 }) : attachmentError(outcome.error);
  } catch (error) {
    return serverError("delete this file", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
export const DELETE = withSessionCheck(handleDELETE);
