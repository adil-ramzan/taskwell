import { DatabaseZap, RotateCw } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Temporarily unavailable | Taskwell",
  robots: { index: false, follow: false },
};

// Only same-origin paths, so the "Try again" link can't send anyone elsewhere.
function safePath(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;

  return path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/dashboard";
}

/**
 * Where the dashboard sends someone whose session can't be checked because the
 * database is unreachable. Says nothing about the cause beyond that, and doesn't
 * pretend they are signed out.
 */
export default function UnavailablePage({ searchParams }: { searchParams: { from?: string | string[] } }) {
  const retry = safePath(searchParams.from);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-16 dark:bg-dark-background">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-dark-surface"
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-ink dark:text-slate-100">
          <DatabaseZap aria-hidden="true" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink dark:text-slate-50">Taskwell is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted dark:text-dark-muted">
          We can&apos;t reach our database right now, so we can&apos;t confirm your sign-in or load your work. You
          haven&apos;t been signed out. Please try again in a moment.
        </p>
        <a
          href={retry}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
        >
          <RotateCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </a>
      </div>
    </main>
  );
}
