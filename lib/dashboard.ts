import "server-only";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cache } from "react";

import { authOptions } from "@/auth";
import { getDashboardAnalytics, type AnalyticsScope } from "@/lib/analytics";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { describeError } from "@/lib/users";

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  /** Null when the account record could not be loaded. */
  createdAt: Date | null;
  /** IANA time zone the user chose; null when not set. */
  timeZone: string | null;
  /** Uploaded picture or built-in avatar; null shows initials. */
  avatar: AvatarRef | null;
};

/**
 * Reads the NextAuth session on the server. The middleware already protects
 * /dashboard/:path*; this is a second check that also preserves callbackUrl.
 */
export async function requireDashboardUser(callbackPath: string): Promise<DashboardUser> {
  const session = await getServerSession(authOptions);

  // The database is unreachable, so the session can't be checked: neither let
  // them in nor send them to log in.
  if (session?.unavailable) {
    redirect(`/unavailable?from=${encodeURIComponent(callbackPath)}`);
  }

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  const email = session.user.email ?? "";
  const account = await getAccount(session.user.id);

  return {
    id: session.user.id,
    // From the database, so a renamed account shows its new name without signing in again.
    name: account?.name.trim() || session.user.name?.trim() || email,
    email,
    createdAt: account?.createdAt ?? null,
    timeZone: account?.timeZone ?? null,
    avatar: toAvatarRef(account),
  };
}

// Deduplicated per request, so the layout and page share one query.
const getAccount = cache(async (userId: string) => {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, createdAt: true, timeZone: true, ...avatarSelect },
    });
  } catch (error) {
    // Logged on the server only; the UI falls back to "No data yet".
    console.error("Dashboard account lookup failed:", error);
    return null;
  }
});

/**
 * Analytics and project options for the overview. Like the account lookup, a
 * failure is logged and shown as unavailable ("No data yet") instead of breaking
 * the dashboard; real zero counts are still shown as 0. Each half fails on its own.
 */
export async function getDashboardOverview(userId: string, scope: AnalyticsScope) {
  const [analytics, projects] = await Promise.all([
    getDashboardAnalytics(userId, scope).catch((error: unknown) => {
      console.error("Dashboard analytics failed:", describeError(error));
      return null;
    }),
    listProjectOptionsForOwner(userId).catch((error: unknown) => {
      console.error("Dashboard project options failed:", describeError(error));
      return null;
    }),
  ]);

  return { analytics, projects };
}
