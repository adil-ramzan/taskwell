import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { loginThrottle } from "@/lib/password-throttle";
import { checkSecondFactor } from "@/lib/two-factor";
import { describeError, getSessionVersion, validateUserCredentials } from "@/lib/users";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Only sent on the second step, for accounts with two-factor sign-in on.
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");

        // Malformed attempts don't count towards the sign-in throttle.
        if (!email || !password) {
          return null;
        }

        // The route wrapper normally answers 429 before this; checked here too.
        if (loginThrottle.throttledFor(email) > 0) {
          return null;
        }

        let user;

        try {
          user = await validateUserCredentials(email, password);
        } catch (error) {
          // Usually the database is unreachable or misconfigured (DATABASE_URL).
          console.error("[auth] Credentials sign-in failed:", describeError(error));
          throw new Error("Authentication is temporarily unavailable.");
        }

        if (!user) {
          // Counted per email whether or not an account exists, so throttling reveals nothing.
          loginThrottle.recordFailure(email);

          if (process.env.NODE_ENV !== "production") {
            console.warn("[auth] Credentials sign-in rejected: unknown email or wrong password.");
          }

          return null;
        }

        loginThrottle.clear(email);

        // Second step for accounts with 2FA. These errors reach the login page as
        // ?error=<message>; the password was right, so they are not counted as failures.
        if (user.twoFactorEnabled) {
          const code = String(credentials?.code ?? "").trim();

          if (!code) {
            throw new Error("TwoFactorRequired");
          }

          let check;

          try {
            check = await checkSecondFactor(user.id, code);
          } catch (error) {
            console.error("[auth] Two-factor check failed:", describeError(error));
            throw new Error("Authentication is temporarily unavailable.");
          }

          if (check === "throttled") throw new Error("TwoFactorThrottled");
          if (check !== "ok") throw new Error("TwoFactorInvalid");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    /*
     * Runs at sign-in and on every server-side session lookup (getServerSession,
     * which every dashboard page and API route goes through). A token whose
     * session version no longer matches the account's, because the password was
     * changed since it was issued, or whose account is gone, is emptied: it
     * carries no identity from then on, on every browser and device.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sv = user.sessionVersion ?? 0;
        return token;
      }

      if (!token.id) {
        return token;
      }

      let version: number | null;

      try {
        version = await getSessionVersion(token.id);
      } catch (error) {
        // Can't tell whether the session is still valid: refuse it for this request
        // without ending it, so a database outage doesn't sign everyone out.
        console.error("[auth] Session check failed:", describeError(error));
        return { ...token, unverified: true };
      }

      if (version === null || version !== (token.sv ?? 0)) {
        return {};
      }

      delete token.unverified;
      return token;
    },
    async session({ session, token }) {
      // Not verifiable right now (database unreachable): no user, and marked so
      // pages and APIs report "unavailable" rather than "signed out".
      if (token.unverified) {
        return { expires: session.expires, unavailable: true } as Session;
      }

      // No identity (revoked or deleted account): a session without a user.
      if (!token.id || !session.user) {
        return { expires: session.expires } as Session;
      }

      // The version stays in the encrypted token; only the ID is added.
      session.user.id = String(token.id);

      return session;
    },
  },
};
