import { NextResponse, type NextRequest } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { currentToken, reissueSessionCookie } from "@/lib/session-cookie";
import { confirmTwoFactorSetup, TwoFactorNotConfiguredError } from "@/lib/two-factor";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../../_shared";

const errors = {
  invalid: ["That code isn't valid. Check the time on your phone and try the newest code.", 400],
  "no-setup": ["Start the setup again: there is no pending setup for your account.", 409],
  "already-enabled": ["Two-factor sign-in is already on.", 409],
} as const;

/**
 * Confirms setup with { code }. On success 2FA is on, every other session of the
 * account ends, this browser gets a fresh session cookie, and the 10 recovery
 * codes are returned (the only time they are ever shown).
 */
async function handlePOST(request: NextRequest) {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  const parsed = await readJson(request);

  if ("response" in parsed) {
    return parsed.response;
  }

  const body = parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body) ? (parsed.body as Record<string, unknown>) : {};
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code) {
    return jsonError("Enter the 6-digit code from your authenticator app.", 400);
  }

  try {
    const token = await currentToken(request, userId);
    if (!token) return unauthorized();

    const outcome = await confirmTwoFactorSetup(userId, code, token.sv ?? 0);

    if ("codes" in outcome) {
      const response = NextResponse.json({ recoveryCodes: outcome.codes }, { headers: { "Cache-Control": "no-store" } });
      await reissueSessionCookie(response, token, outcome.version);
      return response;
    }

    switch (outcome.error) {
      case "not-found":
      case "conflict":
        return unauthorized();
      case "throttled":
        return NextResponse.json({ error: "Too many incorrect codes. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
      default: {
        const [message, status] = errors[outcome.error];
        return jsonError(message, status);
      }
    }
  } catch (error) {
    if (error instanceof TwoFactorNotConfiguredError) {
      return jsonError("Two-factor sign-in isn't set up on this server yet.", 503);
    }

    return serverError("turn on two-factor sign-in", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
