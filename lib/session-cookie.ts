import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { encode, getToken, type JWT } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";

/*
 * Ending every other session while keeping this one: the account's session
 * version is raised (so every token issued before is rejected by auth.ts), and
 * in the same response this browser gets a new token carrying the new version.
 * Uses NextAuth's own token format, cookie name and options, so nothing else in
 * the sign-in flow changes.
 */
const MAX_AGE = 30 * 24 * 60 * 60; // NextAuth's default session lifetime
const secret = () => process.env.AUTH_SECRET ?? "";
// The same rule NextAuth uses to pick the __Secure- cookie name.
const secureCookies = () => process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
const cookieName = () => `${secureCookies() ? "__Secure-" : ""}next-auth.session-token`;

/** This request's decoded session token, if it belongs to `userId`. */
export async function currentToken(request: NextRequest, userId: string) {
  const token = await getToken({ req: request, secret: secret(), secureCookie: secureCookies() });

  return token?.id === userId ? token : null;
}

/**
 * Raises the account's session version, but only if this token still carries
 * the current one (so a session that was itself just revoked can't revoke
 * others). Returns the new version, or null if the token is out of date.
 */
export async function raiseSessionVersion(userId: string, token: JWT) {
  const from = token.sv ?? 0;
  const { count } = await prisma.user.updateMany({
    where: { id: userId, sessionVersion: from },
    data: { sessionVersion: { increment: 1 } },
  });

  return count > 0 ? from + 1 : null;
}

/** Puts a token with `version` on the response, replacing this browser's session cookie. */
export async function reissueSessionCookie(response: NextResponse, token: JWT, version: number) {
  const { iat: _iat, exp: _exp, jti: _jti, ...claims } = token;
  const value = await encode({ token: { ...claims, sv: version }, secret: secret(), maxAge: MAX_AGE });

  response.cookies.set(cookieName(), value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookies(),
    maxAge: MAX_AGE,
  });
}
