"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DEFAULT_LABEL_COLOR, LABEL_NAME_MAX_LENGTH, labelNameKey, normalizeLabelName, type LabelColor } from "@/lib/label-rules";
import type { LabelSummary } from "@/lib/labels";
import LabelChip from "./LabelChip";
import LabelColorPicker from "./LabelColorPicker";

interface LabelPickerProps {
  /** The project whose workspace the labels come from; "" while none is chosen. */
  projectId: string;
  /** The chosen label IDs. */
  value: string[];
  /** `labels` are the chosen ones in full, for a caller that shows them. */
  onChange: (labelIds: string[], labels: LabelSummary[]) => void;
  disabled?: boolean;
  /** Changes whenever the labels may have changed elsewhere (a rename, a delete), to load them again. */
  reloadKey?: string | number;
}

const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-ink/20 bg-white pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50 dark:placeholder:text-dark-muted";
const hintClass = "text-sm text-muted dark:text-dark-muted";

/**
 * Chooses a task's labels: a search box over the labels of the project's
 * workspace, a checkbox for each, and, when the search text isn't an existing
 * label, a way to create it on the spot (name from the search box, a colour,
 * one button). Everything is ordinary form controls, so it works from the
 * keyboard as it stands. Which labels a task may carry is decided by the server.
 */
export default function LabelPicker({ projectId, value, onChange, disabled, reloadKey }: LabelPickerProps) {
  const id = useId();
  const [labels, setLabels] = useState<LabelSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // The latest props, for the effect below, which must not re-run when they change.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    if (!projectId) {
      setLabels(null);
      return;
    }

    let cancelled = false;

    setLoadError("");

    (async () => {
      try {
        const response = await fetch(`/api/labels?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { labels?: LabelSummary[] } | null;

        if (cancelled) return;

        if (!response.ok || !Array.isArray(payload?.labels)) {
          setLabels(null);
          setLoadError("We couldn't load the labels right now. Please try again.");
          return;
        }

        setLabels(payload.labels);

        // Labels of another workspace (the project was changed) or deleted ones can't stay chosen.
        const known = new Set(payload.labels.map((label) => label.id));
        const kept = latest.current.value.filter((labelId) => known.has(labelId));

        if (kept.length !== latest.current.value.length) {
          latest.current.onChange(kept, payload.labels.filter((label) => kept.includes(label.id)));
        }
      } catch {
        if (!cancelled) setLoadError("Unable to reach the server. Check your connection and try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  if (!projectId) {
    return <p className={hintClass}>Choose a project to see its labels.</p>;
  }

  if (loadError) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        {loadError}
      </p>
    );
  }

  if (labels === null) {
    return <p className={hintClass}>Loading labels...</p>;
  }

  // Loaded: from here on the list is always there.
  const all = labels;
  const name = normalizeLabelName(query);
  const key = labelNameKey(query);
  const matches = key ? all.filter((label) => labelNameKey(label.name).includes(key)) : labels;
  const exact = all.some((label) => labelNameKey(label.name) === key);
  const canCreate = name !== "" && !exact;
  const emit = (ids: string[], from = all) => onChange(ids, from.filter((label) => ids.includes(label.id)));

  function toggle(labelId: string, checked: boolean) {
    setError("");
    emit(checked ? [...value, labelId] : value.filter((other) => other !== labelId));
  }

  async function create() {
    if (creating || !canCreate) return;

    setError("");
    setCreating(true);

    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, projectId }),
      });
      const payload = (await response.json().catch(() => null)) as { label?: LabelSummary; error?: unknown } | null;

      if (!response.ok || !payload?.label) {
        setError(typeof payload?.error === "string" ? payload.error : "We couldn't create this label right now. Please try again.");
        return;
      }

      const created = payload.label;
      const next = [...all, created].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

      setLabels(next);
      setQuery("");
      setAnnouncement(`Label “${created.name}” created and added.`);
      emit([...value, created.id], next);
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative">
        <label htmlFor={`${id}-search`} className="sr-only">
          Search labels, or type a new label&apos;s name
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
        <input
          id={`${id}-search`}
          type="search"
          value={query}
          maxLength={LABEL_NAME_MAX_LENGTH}
          disabled={disabled}
          autoComplete="off"
          placeholder="Search or create a label..."
          onChange={(event) => {
            setQuery(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            // Enter here never submits the task form around it; it creates the label when that is on offer.
            if (event.key === "Enter") {
              event.preventDefault();
              void create();
            }
          }}
          className={inputClass}
        />
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {all.length === 0 && !canCreate ? (
        <p className={hintClass}>No labels here yet. Type a name above to create the first one.</p>
      ) : matches.length === 0 ? (
        <p className={hintClass}>No label matches “{name}”.</p>
      ) : (
        <ul aria-label="Labels to choose from" className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-ink/10 p-1 [scrollbar-width:thin] dark:border-white/10">
          {matches.map((label) => (
            <li key={label.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-ink/5 has-[:disabled]:cursor-not-allowed dark:hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={value.includes(label.id)}
                  disabled={disabled}
                  onChange={(event) => toggle(label.id, event.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-ink/30 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
                />
                <LabelChip label={label} />
              </label>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <div className="rounded-lg border border-dashed border-ink/20 p-3 dark:border-white/20">
          <p className="text-sm text-ink dark:text-slate-100">
            New label: <LabelChip label={{ name, color }} />
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <LabelColorPicker name={`${id}-color`} value={color} onChange={setColor} disabled={disabled || creating} />
            <button
              type="button"
              onClick={() => void create()}
              disabled={disabled || creating}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {creating ? "Creating..." : "Create label"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
