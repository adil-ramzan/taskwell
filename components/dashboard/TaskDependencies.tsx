"use client";

import { ChevronDown, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";

import type { DependencyLink, TaskDependencies as Dependencies } from "@/lib/dependencies";
import { DEPENDENCY_RELATIONS, dependencyRelationLabels, type DependencyRelation } from "@/lib/task-validation";
import { TaskStatusBadge } from "./TaskBadges";

interface TaskDependenciesProps {
  taskId: string;
  dependencies: Dependencies;
  /** The other tasks of the same project, which are the only ones a dependency can link to. */
  candidates: { id: string; title: string }[];
}

const selectClass =
  "min-h-11 w-full appearance-none truncate rounded-lg border border-ink/20 bg-white pl-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";
const labelClass = "mb-1 block text-xs font-medium text-muted dark:text-dark-muted";

function Select({
  id,
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={selectClass}>
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
        />
      </div>
    </div>
  );
}

/**
 * What a task is waiting for and what is waiting for it. Dependencies are
 * planning notes between tasks of one project: they are shown here and in the
 * history, and change nothing else about either task.
 */
export default function TaskDependencies({ taskId, dependencies, candidates }: TaskDependenciesProps) {
  const router = useRouter();
  const id = useId();
  const [relation, setRelation] = useState<DependencyRelation>("blocked-by");
  const [otherId, setOtherId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const lists: Record<DependencyRelation, DependencyLink[]> = {
    "blocked-by": dependencies.blockedBy,
    blocks: dependencies.blocks,
  };
  // A task already linked in the chosen direction can't be linked that way again.
  const linked = new Set(lists[relation].map((link) => link.task.id));
  const options = candidates.filter((candidate) => !linked.has(candidate.id));

  const failure = async (response: Response, fallback: string) => {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

    return typeof payload?.error === "string" ? payload.error : fallback;
  };

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    if (!otherId) {
      setError("Choose a task for this dependency.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation, taskId: otherId }),
      });

      if (!response.ok) {
        setError(await failure(response, "We couldn't add this dependency right now. Please try again."));
        return;
      }

      const title = candidates.find((candidate) => candidate.id === otherId)?.title ?? "the task";

      setAnnouncement(
        relation === "blocked-by" ? `This task is now blocked by “${title}”.` : `This task now blocks “${title}”.`,
      );
      setOtherId("");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(link: DependencyLink) {
    setError("");
    setRemoving((current) => new Set(current).add(link.id));

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies/${link.id}`, { method: "DELETE" });

      if (!response.ok) {
        setError(await failure(response, "We couldn't remove this dependency right now. Please try again."));
        return;
      }

      setAnnouncement(`Removed the dependency with “${link.task.title}”.`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(link.id);
        return next;
      });
    }
  }

  return (
    <>
      <h2 id="task-dependencies-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
        Dependencies
      </h2>
      <p className="mt-1 text-sm text-muted dark:text-dark-muted">
        Which tasks of this project have to wait for which. They are notes for planning: no status is changed or locked.
      </p>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {DEPENDENCY_RELATIONS.map((kind) => (
          <section key={kind} aria-labelledby={`${id}-${kind}`} className="min-w-0">
            <h3 id={`${id}-${kind}`} className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-muted">
              {dependencyRelationLabels[kind]}
            </h3>
            {lists[kind].length === 0 ? (
              <p className="mt-2 text-sm text-muted dark:text-dark-muted">
                {kind === "blocked-by" ? "Not waiting for any task." : "No task is waiting for this one."}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {lists[kind].map((link) => (
                  <li
                    key={link.id}
                    aria-busy={removing.has(link.id)}
                    className={`flex items-start gap-2 rounded-lg border border-ink/10 px-3 py-2 dark:border-white/10 ${
                      removing.has(link.id) ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/tasks/${link.task.id}`}
                        className="break-words rounded text-sm font-medium text-ink hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [overflow-wrap:anywhere] dark:text-slate-50"
                      >
                        {link.task.title}
                      </Link>
                      <p className="mt-1.5">
                        <span className="sr-only">Status: </span>
                        <TaskStatusBadge status={link.task.status} />
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(link)}
                      disabled={removing.has(link.id)}
                      aria-label={
                        kind === "blocked-by"
                          ? `Remove: blocked by ${link.task.title}`
                          : `Remove: blocks ${link.task.title}`
                      }
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-progress dark:text-dark-muted dark:hover:bg-red-500/10 dark:hover:text-red-300"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {candidates.length === 0 ? (
        <p className="mt-5 border-t border-ink/10 pt-4 text-sm text-muted dark:border-white/10 dark:text-dark-muted">
          This is the only task in its project, so there is nothing to link it to yet.
        </p>
      ) : (
        <form
          onSubmit={add}
          noValidate
          aria-label="Add dependency"
          className="mt-5 grid gap-3 border-t border-ink/10 pt-4 dark:border-white/10 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-end"
        >
          <Select
            id={`${id}-relation`}
            label="This task"
            value={relation}
            disabled={saving}
            onChange={(value) => {
              setRelation(value as DependencyRelation);
              setOtherId("");
              setError("");
            }}
          >
            <option value="blocked-by">Is blocked by</option>
            <option value="blocks">Blocks</option>
          </Select>
          <Select id={`${id}-task`} label="Task" value={otherId} disabled={saving} onChange={setOtherId}>
            <option value="">{options.length === 0 ? "No other task to choose" : "Choose a task"}</option>
            {options.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </Select>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
          >
            {saving ? "Adding..." : "Add dependency"}
          </button>
        </form>
      )}
    </>
  );
}
