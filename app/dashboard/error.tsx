"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Details are logged on the server by Next.js. In production the browser only
  // receives a generic error plus a digest, which is all we show here.
  return (
    <div
      role="alert"
      className="mx-auto max-w-lg rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-dark-surface"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <CircleAlert aria-hidden="true" className="h-6 w-6" />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-display text-xl font-semibold text-ink focus:outline-none dark:text-slate-50"
      >
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted dark:text-dark-muted">
        We couldn&apos;t load this part of your dashboard. Please try again.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted dark:text-dark-muted">Reference: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
      >
        <RotateCw aria-hidden="true" className="h-4 w-4" />
        Retry
      </button>
    </div>
  );
}
