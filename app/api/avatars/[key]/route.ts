import { findViewableAvatar } from "@/lib/account-avatar";
import { getSessionUserId, jsonError, withSessionCheck } from "@/lib/api";
import { readAvatar } from "@/lib/avatar-store";
import { UPLOAD_KEY_PATTERN } from "@/lib/avatars";

const notFound = () => jsonError("Not found.", 404);

/**
 * Serves an uploaded avatar to people allowed to see it (its owner and their
 * teammates); everyone else, and any name that isn't an upload key, gets 404.
 * Avatars aren't public: a signed-out request is 401.
 */
async function handleGET(_request: Request, { params }: { params: { key: string } }) {
  const userId = await getSessionUserId();

  if (!userId) {
    return jsonError("Sign in to see this picture.", 401);
  }

  if (!UPLOAD_KEY_PATTERN.test(params.key) || !(await findViewableAvatar(userId, params.key))) {
    return notFound();
  }

  const image = await readAvatar(params.key);

  if (!image) {
    return notFound();
  }

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      // Each upload gets a new name, so the browser may keep it; never shared caches.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}

// An unverifiable session (database down) answers 503 rather than 401.
export const GET = withSessionCheck(handleGET);
