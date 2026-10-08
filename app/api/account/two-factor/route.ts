import { NextResponse } from "next/server";

import { withSessionCheck } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { disableTwoFactor, startTwoFactorSetup, TwoFactorNotConfiguredError } from "@/lib/two-factor";
import { getSessionUserId, jsonError, readJson, serverError, unauthorized } from "../_shared";

const notConfigured = () => jsonError("Two-factor sign-in isn't set up on this server yet.", 503);

/**
 * Starts 2FA setup for the signed-in user: a new secret (kept encrypted until
 * confirmed) as a QR code, the otpauth link and the key for manual entry. This
 * response is the only place the secret ever leaves the server.
 */
async function handlePOST() {
  const userId = await getSessionUserId();

  if (!userId) {
    return unauthorized();
  }

  try {
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!account) return unauthorized();

    const outcome = await startTwoFactorSetup(userId, account.email);

    if ("error" in outcome) {
      return outcome.error === "already-enabled" ? jsonError("Two-factor sign-in is already on.", 409) : unauthorized();
    }

    return NextResponse.json({ setup: outcome.setup }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TwoFactorNotConfiguredError) return notConfigured();
    return serverError("start two-factor setup", error);
  }
}

const disableErrors = {
  "not-enabled": ["Two-factor sign-in is already off.", 409],
  "wrong-password": ["Your password is incorrect.", 403],
  invalid: ["That code isn't valid.", 403],
} as const;

/** Turns 2FA off: { password, code } where code is an app code or a recovery code. */
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
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!password || !code) {
    return jsonError("Enter your password and a code from your authenticator app (or a recovery code).", 400);
  }

  try {
    const outcome = await disableTwoFactor(userId, password, code);

    if ("disabled" in outcome) {
      return new NextResponse(null, { status: 204 });
    }

    if (outcome.error === "not-found") return unauthorized();

    if (outcome.error === "throttled") {
      return NextResponse.json({ error: "Too many incorrect attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
    }

    const [message, status] = disableErrors[outcome.error];
    return jsonError(message, status);
  } catch (error) {
    if (error instanceof TwoFactorNotConfiguredError) return notConfigured();
    return serverError("turn off two-factor sign-in", error);
  }
}

// An unverifiable session (database down) answers 503 rather than 401.
export const POST = withSessionCheck(handlePOST);
export const DELETE = withSessionCheck(handleDELETE);
