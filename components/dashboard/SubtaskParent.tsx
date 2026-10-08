"use client";

import { CornerLeftUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SubtaskParentProps {
  taskId: string;
  parent: { id: string; title: string };
}

/**
 * On a subtask's page: the way back to its parent, and "Detach", which makes
 * it an ordinary top-level task again without deleting anything.
 */
export default function SubtaskParent({ taskId, parent }: SubtaskParentProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function detach() {
    setError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentTaskId: null }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

        setError(typeof payload?.error === "string" ? payload.error : "We couldn't detach this subtask right now. Please try again.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-ink/10 bg-paper px-4 py-3 dark:border-white/10 dark:bg-dark-background">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 items-start gap-2 text-sm text-muted dark:text-dark-muted">
          <CornerLeftUp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            Subtask of{" "}
            <Link
              href={`/dashboard/tasks/${parent.id}`}
              className="rounded font-medium text-brand-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
            >
              {parent.title}
            </Link>
          </span>
        </p>
        <button
          type="button"
          onClick={detach}
          disabled={saving}
          aria-describedby="detach-subtask-hint"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
        >
          {saving ? "Detaching..." : "Detach from parent"}
        </button>
      </div>
      <p id="detach-subtask-hint" className="sr-only">
        Makes this an ordinary task that is no longer a subtask. Nothing is deleted.
      </p>
      {error && (
        <p role="alert" className="mt-2 break-words text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
