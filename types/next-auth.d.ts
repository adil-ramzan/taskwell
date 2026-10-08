import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    /** Set (with no user) when the session couldn't be checked because the database is unreachable. */
    unavailable?: boolean;
  }

  interface User {
    id: string;
    /** Only used to stamp the token at sign-in; never copied into the session. */
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** User.sessionVersion when the token was issued (missing on tokens from before it existed = 0). */
    sv?: number;
    /** Set for one request when the version couldn't be checked; the session then has no user. */
    unverified?: boolean;
  }
}
