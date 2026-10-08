import { NextResponse } from "next/server";

import { choosePresetAvatar, uploadAvatar, resetToInitials } from "@/lib/account-avatar";
import { withSessionCheck } from "@/lib/api";
import { AVATAR_MAX_BYTES, isPresetAvatarId } from "@/lib/avatars";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../_shared";

const tooLarge = () => jsonError("Choose an image of 2 MB or less.", 413);

const uploadErrors = {
  unsupported: ["Choose a JPG, PNG or WebP image.", 415],
  invalid: ["That file isn't a valid image. Try another one.", 400],
} as const;

/** Uploads a new avatar image (multipart form, field "file"). The file name and type sent are ignored. */
async function handlePOST(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  // Refuse big bodies before reading them; the form overhead is allowed for.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > AVATAR_MAX_BYTES + 64 * 1024) {
    return tooLarge();
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || typeof file === "string") {
    return jsonError("Choose an image to upload.", 400);
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return tooLarge();
  }

  try {
    const outcome = await uploadAvatar(userId, Buffer.from(await file.arrayBuffer()));

    if ("error" in outcome) {
      if (outcome.error === "not-found") return unauthorized();

      const [message, status] = uploadErrors[outcome.error];
      return jsonError(message, status);
    }

    return NextResponse.json({ avatar: outcome.avatar }, { status: 201 });
  } catch (error) {
    return serverError("save your picture", error);
  }
}

/** Chooses a built-in avatar ({ preset: id }) or initials ({ preset: null }). Only IDs from the built-in list are accepted. */
async function handlePATCH(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const body = parsed.body;
  const preset = body && typeof body === "object" && !Array.isArray(body) ? (body as { preset?: unknown }).preset : undefined;

  if (preset !== null && !isPresetAvatarId(preset)) {
    return jsonError("Choose one of the avatars shown.", 400);
  }

  try {
    const avatar = preset === null ? await resetToInitials(userId) : await choosePresetAvatar(userId, preset);

    return NextResponse.json({ avatar });
  } catch (error) {
    return serverError("save your picture", error);
  }
}

/** Removes the avatar (uploaded file included) and goes back to initials. */
async function handleDELETE() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    await resetToInitials(userId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serverError("remove your picture", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
export const PATCH = withSessionCheck(handlePATCH);
export const DELETE = withSessionCheck(handleDELETE);
