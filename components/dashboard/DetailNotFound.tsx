import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

import EmptyState from "./EmptyState";

interface DetailNotFoundProps {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}

/** Shown for a missing item and for one owned by someone else, so IDs can't be probed. */
export default function DetailNotFound({ title, description, backHref, backLabel }: DetailNotFoundProps) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
      <EmptyState icon={SearchX} title={title} description={description} titleAs="h1">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {backLabel}
        </Link>
      </EmptyState>
    </div>
  );
}
