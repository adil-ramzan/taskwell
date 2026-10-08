import "server-only";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { describeError, isDatabaseUnavailable } from "@/lib/users";

/** The session couldn't be checked (the database is unreachable). Never treated as signed in or signed out. */
export class SessionUnavailableError extends Error {
  constructor() {
    super("The session could not be verified.");
    this.name = "SessionUnavailableError";
  }
}

/**
 * The only trusted source of the user's identity; IDs in the request are never
 * used for access. Null when signed out; throws SessionUnavailableError when the
 * session can't be verified, which withSessionCheck turns into a 503.
 */
export async function getSessionUserId() {
  const session = await getServerSession(authOptions);

  if (session?.unavailable) {
    throw new SessionUnavailableError();
  }

  return session?.user?.id ?? null;
}

export const serviceUnavailable = () =>
  NextResponse.json(
    { error: "Taskwell can't reach its database right now. Please try again in a moment." },
    { status: 503, headers: { "Retry-After": "30" } },
  );

/** Wraps a route handler so an unverifiable session answers 503 instead of 401 or 500. */
export function withSessionCheck<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof SessionUnavailableError) {
        return serviceUnavailable();
      }

      throw error;
    }
  };
}

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function readJson(request: Request): Promise<{ body: unknown } | { response: NextResponse }> {
  try {
    return { body: await request.json() };
  } catch {
    return { response: jsonError("Request body must be valid JSON.", 400) };
  }
}

/** Logs the real cause server-side under `[scope]` and returns a safe message to the client. */
export function serverError(scope: string, action: string, error: unknown) {
  console.error(`[${scope}] Could not ${action}:`, describeError(error));

  return jsonError(`We couldn't ${action} right now. Please try again.`, isDatabaseUnavailable(error) ? 503 : 500);
}
