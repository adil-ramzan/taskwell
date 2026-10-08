import { NextResponse } from "next/server";

import { deleteAccount } from "@/lib/account-deletion";
import { withSessionCheck } from "@/lib/api";
import { verifySecondFactor } from "@/lib/two-factor";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "./_shared";

const messages = {
  "email-mismatch": ["Type your account's email address exactly to confirm.", 400],
  "wrong-password": ["Your password is incorrect.", 403],
  "code-required": ["Enter the code from your authenticator app, or a recovery code.", 400],
  "wrong-code": ["That two-factor code isn't valid.", 403],
} as const;

/**
 * Deletes the signed-in account, after confirmation: { email, password, code? }.
 * The account is always the session's. See lib/account-deletion.ts for what is
 * kept and what is removed.
 */
async function handleDELETE(request: Request) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const body = parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body) ? (parsed.body as Record<string, unknown>) : {};
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" && body.code.trim() ? body.code : undefined;

  if (!email.trim() || !password) {
    return jsonError("Type your email address and your password to confirm.", 400);
  }

  try {
    const outcome = await deleteAccount(userId, { email, password, code }, verifySecondFactor);

    if ("deleted" in outcome) {
      return NextResponse.json({ deleted: true });
    }

    switch (outcome.error) {
      case "not-found":
        return unauthorized();
      case "throttled":
        return NextResponse.json(
          { error: "Too many incorrect attempts. Try again later." },
          { status: 429, headers: { "Retry-After": String(outcome.retryAfter ?? 900) } },
        );
      case "owns-teams":
        return NextResponse.json(
          {
            error: "You own teams. Delete them first; ownership can't be transferred yet.",
            teams: "teams" in outcome ? outcome.teams : [],
          },
          { status: 409 },
        );
      default: {
        const [message, status] = messages[outcome.error];
        return jsonError(message, status);
      }
    }
  } catch (error) {
    return serverError("delete your account", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const DELETE = withSessionCheck(handleDELETE);
