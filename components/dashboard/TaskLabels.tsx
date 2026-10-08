"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { LabelRef } from "@/lib/label-rules";
import type { LabelSummary } from "@/lib/labels";
import type { TaskSummary } from "@/lib/tasks";
import { termClass } from "./detail-styles";
import { LabelList } from "./LabelChip";
import LabelPicker from "./LabelPicker";

/**
 * A task's labels on its own page, and a picker to change them in place.
 * Each tick is saved at once, one label at a time (POST / DELETE
 * /api/tasks/:id/labels), so two people labelling the same task don't undo
 * each other; a refused change is taken back with the reason.
 */
export default function TaskLabels({ task }: { task: TaskSummary }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  // What is shown while a change is on its way; the server's data replaces it on refresh.
  const [labels, setLabels] = useState<LabelRef[]>(task.labels);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  // The label IDs the server last confirmed to this component, while a page refresh that shows them is
  // still on its way. A refresh that was requested before that change carries older data and must not
  // put a tick back or take one away; it is ignored until the page's data agrees (or a few seconds pass).
  const confirmed = useRef<{ ids: string; at: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const fromPage = task.labels.map((label) => label.id).sort().join();

    if (busy.current) return;

    if (confirmed.current && confirmed.current.ids !== fromPage && Date.now() - confirmed.current.at < 5000) return;

    confirmed.current = null;
    setLabels(task.labels);
  }, [task.labels]);

  async function change(nextIds: string[], chosen: LabelSummary[]) {
    const before = labels;
    const added = chosen.find((label) => !before.some((other) => other.id === label.id));
    const removed = before.find((label) => !nextIds.includes(label.id));

    if (!added && !removed) return;

    setError("");
    setSaving(true);
    busy.current = true;
    setLabels(
      [...before.filter((label) => nextIds.includes(label.id)), ...(added ? [added] : [])].sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      ),
    );

    try {
      const response = added
        ? await fetch(`/api/tasks/${task.id}/labels`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ labelId: added.id }),
          })
        : await fetch(`/api/tasks/${task.id}/labels/${removed!.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { labels?: LabelRef[]; error?: unknown } | null;

      if (!response.ok || !Array.isArray(payload?.labels)) {
        setLabels(before);
        setError(
          `The labels weren't changed. ${typeof payload?.error === "string" ? payload.error : "Please try again."}`,
        );
        return;
      }

      setLabels(payload.labels);
      confirmed.current = { ids: payload.labels.map((label) => label.id).sort().join(), at: Date.now() };
      setAnnouncement(added ? `Label “${added.name}” added.` : `Label “${removed!.name}” removed.`);
      router.refresh();
    } catch {
      setLabels(before);
      setError("The labels weren't changed. Unable to reach the server. Check your connection and try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="task-labels-heading" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="task-labels-heading" className={termClass}>
          Labels
        </h2>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          aria-expanded={editing}
          aria-controls={editing ? `${id}-picker` : undefined}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-dark hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-100 dark:hover:bg-white/10"
        >
          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          {editing ? "Done" : "Edit labels"}
        </button>
      </div>

      {labels.length > 0 ? (
        <LabelList labels={labels} />
      ) : (
        <p className="text-sm italic text-muted dark:text-dark-muted">No labels</p>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {editing && (
        <div id={`${id}-picker`} className="mt-3 max-w-md">
          <LabelPicker
            projectId={task.project.id}
            value={labels.map((label) => label.id)}
            onChange={(ids, chosen) => void change(ids, chosen)}
            disabled={saving}
          />
        </div>
      )}
    </section>
  );
}
