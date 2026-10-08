"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/** The page numbers to offer: always the first and last, the current one and its neighbours; null marks a gap. */
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);

  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1] > 1 ? [null, value] : [value]));
}

/** One page of a list that is already loaded: the slice to show and where it sits. */
export function paginate<T>(items: T[], requested: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  // A page past the end (an old link, or a list that got shorter) is the last page.
  const page = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, pageCount) : 1;
  const start = (page - 1) * pageSize;

  return { page, pageCount, items: items.slice(start, start + pageSize), from: items.length === 0 ? 0 : start + 1, to: Math.min(start + pageSize, items.length), total: items.length };
}

/**
 * Pages a loaded list with the page number kept in the address (`?page=2`), so
 * a refresh, a shared link and Back return to the same page. Whenever
 * `resetKey` changes (the filters, the search, the sort order) the list starts
 * again from its first page.
 */
export function useUrlPagination<T>(items: T[], pageSize: number, resetKey: string, param = "page") {
  const searchParams = useSearchParams();
  const result = paginate(items, Number(searchParams.get(param) ?? "1"), pageSize);

  const setPage = useCallback(
    (next: number, mode: "push" | "replace" = "push") => {
      const params = new URLSearchParams(window.location.search);

      if (next > 1) params.set(param, String(next));
      else params.delete(param);

      const query = params.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}`;

      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [param],
  );
  const lastKey = useRef(resetKey);

  useEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      setPage(1, "replace");
    }
  }, [resetKey, setPage]);

  return { ...result, setPage };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  /** The first and last item shown, and how many there are in all. */
  from: number;
  to: number;
  total: number;
  /** Plural noun for the summary and the control's name, e.g. "tasks". */
  noun: string;
  onChange: (page: number) => void;
  /** Previous/Next and "1–10 of 36" only, for narrow places such as a board column. */
  compact?: boolean;
  /** An element to bring back into view after changing page (the top of the list). */
  scrollToId?: string;
}

const buttonClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-ink/15 bg-white px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink/15 disabled:hover:text-ink dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const currentClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";

/**
 * Page controls for a list: what is shown ("26–50 of 129 tasks"), Previous and
 * Next, and from `sm` up the page numbers. Renders nothing for a single page.
 */
export default function Pagination({ page, pageCount, from, to, total, noun, onChange, compact = false, scrollToId }: PaginationProps) {
  if (pageCount <= 1) return null;

  const go = (next: number) => {
    onChange(next);
    if (scrollToId) document.getElementById(scrollToId)?.scrollIntoView({ block: "start" });
  };

  return (
    <nav
      aria-label={`Pages of ${noun}`}
      className={`flex items-center justify-between gap-3 ${compact ? "" : "flex-col sm:flex-row"}`}
    >
      <p role="status" className={`text-muted dark:text-dark-muted ${compact ? "text-xs" : "text-sm"}`}>
        {from}–{to} of {total}
        {compact ? <span className="sr-only"> {noun}</span> : ` ${noun}`}
        {!compact && <span className="sm:hidden"> · page {page} of {pageCount}</span>}
      </p>
      <ul className="flex items-center gap-1.5">
        <li>
          <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label={`Previous page of ${noun}`} className={buttonClass}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {!compact && <span className="hidden sm:inline">Previous</span>}
          </button>
        </li>
        {!compact &&
          pageNumbers(page, pageCount).map((value, index) =>
            value === null ? (
              <li key={`gap-${index}`} aria-hidden="true" className="hidden px-1 text-muted dark:text-dark-muted sm:block">
                …
              </li>
            ) : (
              <li key={value} className="hidden sm:block">
                <button
                  type="button"
                  onClick={() => go(value)}
                  aria-label={`Page ${value} of ${pageCount}`}
                  aria-current={value === page ? "page" : undefined}
                  className={value === page ? currentClass : buttonClass}
                >
                  {value}
                </button>
              </li>
            ),
          )}
        <li>
          <button type="button" disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label={`Next page of ${noun}`} className={buttonClass}>
            {!compact && <span className="hidden sm:inline">Next</span>}
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
