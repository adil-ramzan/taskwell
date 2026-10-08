import { NextResponse } from "next/server";

import { validatePasswordChangeInput } from "@/lib/account-validation";
import { withSessionCheck } from "@/lib/api";
import { clearFailedAttempts, recordFailedAttempt, throttledFor } from "@/lib/password-throttle";
import { changeUserPassword } from "@/lib/users";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../_shared";

function tooManyAttempts(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));

  return NextResponse.json(
    { error: `Too many incorrect attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

/**
 * Changes the signed-in user's password. On success every session of the
 * account, this one included, stops working (lib/users.ts raises the session
 * version, auth.ts rejects older tokens). Nothing password-related is logged
 * or returned.
 */
async function handlePOST(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  // A malformed request never counts as a password attempt.
  const result = validatePasswordChangeInput(parsed.body);

  if ("error" in result) {
    return jsonError(result.error, 400);
  }

  const wait = throttledFor(userId);

  if (wait > 0) {
    return tooManyAttempts(wait);
  }

  try {
    const outcome = await changeUserPassword(userId, result.data.currentPassword, result.data.newPassword);

    if (outcome === "wrong-password") {
      recordFailedAttempt(userId);
      return jsonError("Your current password is incorrect.", 403);
    }

    if (outcome === "not-found") {
      return unauthorized();
    }

    clearFailedAttempts(userId);

    return NextResponse.json({ changed: true });
  } catch (error) {
    return serverError("change your password", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
