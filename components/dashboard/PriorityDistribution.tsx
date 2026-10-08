import { TASK_PRIORITIES, taskPriorityLabels, type TaskPriorityValue } from "@/lib/task-validation";

interface PriorityDistributionProps {
  /** Null when task data couldn't be loaded. */
  counts: Record<TaskPriorityValue, number> | null;
  /** Replaces the line under the heading when there are tasks (the Reports page says what its counts cover). */
  description?: string;
}

const barClasses: Record<TaskPriorityValue, string> = {
  LOW: "bg-slate-400 dark:bg-slate-500",
  MEDIUM: "bg-brand",
  HIGH: "bg-red-500",
};

/** Task counts by priority as labelled bars; each row states its count and share in text. */
export default function PriorityDistribution({ counts, description }: PriorityDistributionProps) {
  const total = counts ? TASK_PRIORITIES.reduce((sum, priority) => sum + counts[priority], 0) : 0;

  return (
    <section
      aria-labelledby="priority-distribution-heading"
      className="min-w-0 rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5"
    >
      <h2 id="priority-distribution-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
        Priority distribution
      </h2>
      <p className="mt-1 text-sm text-muted dark:text-dark-muted">
        {counts === null
          ? "Priority data is unavailable right now."
          : total === 0
            ? "No tasks yet, so there is nothing to break down."
            : (description ?? "How your tasks are spread across priorities.")}
      </p>

      {counts !== null && total > 0 && (
        <ul className="mt-5 space-y-4">
          {TASK_PRIORITIES.map((priority) => {
            const count = counts[priority];
            const share = Math.round((count / total) * 100);

            return (
              <li key={priority}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-ink dark:text-slate-100">{taskPriorityLabels[priority]}</span>
                  <span className="text-muted dark:text-dark-muted">
                    <span className="font-medium text-ink dark:text-slate-100">{count}</span>{" "}
                    {count === 1 ? "task" : "tasks"} · {share}%
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                  <div className={`h-full rounded-full ${barClasses[priority]}`} style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
