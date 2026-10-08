"use client";

import { ChevronDown, Search, Tag } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { labelNameKey, type LabelMatchMode } from "@/lib/label-rules";
import type { LabelSummary } from "@/lib/labels";
import LabelChip from "./LabelChip";

export type LabelFilterValue = { ids: string[]; mode: LabelMatchMode };

export const NO_LABEL_FILTER: LabelFilterValue = { ids: [], mode: "any" };

interface LabelFilterProps {
  /** The labels offered: all the user can use, or those of one project's workspace. */
  labels: LabelSummary[];
  value: LabelFilterValue;
  onChange: (value: LabelFilterValue) => void;
}

/**
 * The label filter of the task list and the board: a button that opens a
 * small panel with a search box, a checkbox per label and, once two or more
 * are chosen, how they combine: "Any" (a task with at least one of them) or
 * "All" (a task with every one of them). It filters tasks already loaded for
 * this user; it never asks the server for more.
 */
export default function LabelFilter({ labels, value, onChange }: LabelFilterProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // A label that was deleted can't stay chosen.
  const chosen = value.ids.filter((labelId) => labels.some((label) => label.id === labelId));
  const key = labelNameKey(query);
  const matches = key ? labels.filter((label) => labelNameKey(label.name).includes(key)) : labels;
  // The same name can exist in two workspaces; then each says whose it is.
  const ambiguous = new Set(
    labels.filter((label, index) => labels.some((other, at) => at !== index && labelNameKey(other.name) === labelNameKey(label.name))).map((label) => label.id),
  );

  useEffect(() => {
    if (!open) return;

    searchRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = (labelId: string, checked: boolean) =>
    onChange({ ...value, ids: checked ? [...chosen, labelId] : chosen.filter((other) => other !== labelId) });

  return (
    <div ref={rootRef} className="relative sm:w-44">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        aria-label={chosen.length === 0 ? "Filter by label" : `Filter by label, ${chosen.length} selected`}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-ink/20 bg-white pl-3 pr-3 text-left text-sm text-ink outline-none transition focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50"
      >
        <Tag aria-hidden="true" className="h-4 w-4 shrink-0 text-muted dark:text-dark-muted" />
        <span className="min-w-0 flex-1 truncate">{chosen.length === 0 ? "All labels" : `Labels (${chosen.length})`}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted dark:text-dark-muted" />
      </button>

      {open && (
        <div
          id={`${id}-panel`}
          role="group"
          aria-label="Filter by label"
          className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-ink/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-dark-surface sm:left-auto sm:w-72"
        >
          {labels.length === 0 ? (
            <p className="text-sm text-muted dark:text-dark-muted">
              There are no labels yet. Add one to a task, or use Manage labels.
            </p>
          ) : (
            <>
              <div className="relative">
                <label htmlFor={`${id}-search`} className="sr-only">
                  Search labels
                </label>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                <input
                  ref={searchRef}
                  id={`${id}-search`}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  placeholder="Search labels..."
                  className="min-h-11 w-full rounded-lg border border-ink/20 bg-white pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50 dark:placeholder:text-dark-muted"
                />
              </div>

              {matches.length === 0 ? (
                <p className="mt-3 text-sm text-muted dark:text-dark-muted">No label matches.</p>
              ) : (
                <ul aria-label="Labels" className="mt-2 max-h-60 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
                  {matches.map((label) => (
                    <li key={label.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-ink/5 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={chosen.includes(label.id)}
                          onChange={(event) => toggle(label.id, event.target.checked)}
                          className="h-5 w-5 shrink-0 rounded border-ink/30 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                        />
                        <span className="min-w-0">
                          <LabelChip label={label} />{" "}
                          {ambiguous.has(label.id) && (
                            <span className="ml-1.5 text-xs text-muted dark:text-dark-muted">{label.team?.name ?? "Personal"}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <fieldset className="mt-3 border-t border-ink/10 pt-3 dark:border-white/10">
                <legend className="sr-only">Show tasks that have</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink dark:text-slate-100">
                  {(
                    [
                      ["any", "Any of them"],
                      ["all", "All of them"],
                    ] as const
                  ).map(([mode, text]) => (
                    <label key={mode} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`${id}-mode`}
                        checked={value.mode === mode}
                        onChange={() => onChange({ ...value, ids: chosen, mode })}
                        className="h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                      />
                      {text}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted dark:text-dark-muted">
                  {value.mode === "all"
                    ? "Tasks that have every selected label."
                    : "Tasks that have at least one selected label."}
                </p>
              </fieldset>

              {chosen.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...value, ids: [] })}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-brand-dark hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-100 dark:hover:bg-white/10"
                >
                  Clear label filter
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
