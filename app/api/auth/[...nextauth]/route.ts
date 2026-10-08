import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";
import { loginThrottle } from "@/lib/password-throttle";
import { normalizeEmail } from "@/lib/users";

const handler = NextAuth(authOptions);

type Context = { params: { nextauth: string[] } };

/**
 * NextAuth handles everything; this only refuses a credentials sign-in up front
 * while its email is throttled (5 failures in 15 minutes, counted in auth.ts).
 * The answer is the same whether or not an account has that email. The body
 * matches what next-auth's signIn() reads, so the login page gets
 * error=TooManyAttempts and status 429.
 */
async function POST(request: Request, context: Context) {
  if (context.params.nextauth.join("/") === "callback/credentials") {
    const form = await request.clone().formData().catch(() => null);
    const email = form?.get("email");

    if (typeof email === "string" && email.trim()) {
      const wait = loginThrottle.throttledFor(normalizeEmail(email));

      if (wait > 0) {
        const url = new URL("/api/auth/error?error=TooManyAttempts", request.url).toString();

        return NextResponse.json({ url, error: "Too many failed sign-in attempts." }, {
          status: 429,
          headers: { "Retry-After": String(wait) },
        });
      }
    }
  }

  return handler(request, context);
}

export { handler as GET, POST };
