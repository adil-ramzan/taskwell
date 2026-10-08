import { TASK_STATUSES, taskStatusLabels, type TaskStatusValue } from "@/lib/task-validation";
import { taskStatusColors } from "./TaskBadges";

interface StatusDistributionProps {
  /** Null when task data couldn't be loaded. */
  counts: Record<TaskStatusValue, number> | null;
  /** Replaces the line under the heading (the Reports page says what its counts cover). */
  description?: string;
  /** Also shows each status's share of the total, as on the Reports page. */
  showShare?: boolean;
}

// Builds conic-gradient stops from the real counts, in TASK_STATUSES order.
function donutGradient(counts: Record<TaskStatusValue, number>, total: number) {
  let start = 0;
  const stops = TASK_STATUSES.filter((status) => counts[status] > 0).map((status) => {
    const end = start + (counts[status] / total) * 360;
    const stop = `${taskStatusColors[status].hex} ${start}deg ${end}deg`;
    start = end;
    return stop;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

export default function StatusDistribution({ counts, description, showShare = false }: StatusDistributionProps) {
  const total = counts ? TASK_STATUSES.reduce((sum, status) => sum + counts[status], 0) : 0;
  const hasData = counts !== null && total > 0;

  return (
    <section
      aria-labelledby="status-distribution-heading"
      className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5"
    >
      <div>
        <h2 id="status-distribution-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
          Task status distribution
        </h2>
        <p className="mt-1 text-sm text-muted dark:text-dark-muted">
          {description ?? "A breakdown of your current workload."}
        </p>
      </div>

      <div className="flex justify-center py-5">
        {hasData ? (
          <div
            role="img"
            aria-label={`Task status distribution: ${TASK_STATUSES.map(
              (status) =>
                `${taskStatusLabels[status]} ${counts[status]}${showShare ? ` (${Math.round((counts[status] / total) * 100)}%)` : ""}`,
            ).join(", ")}`}
            className="relative h-40 w-40 rounded-full"
            style={{ background: donutGradient(counts, total) }}
          >
            <div className="absolute inset-[18px] flex items-center justify-center rounded-full bg-white dark:bg-dark-surface">
              <div className="text-center">
                <p className="font-display text-2xl font-bold text-ink dark:text-slate-50">{total}</p>
                <p className="text-xs text-muted dark:text-dark-muted">{total === 1 ? "task" : "tasks"}</p>
              </div>
            </div>
          </div>
        ) : (
          <div
            role="img"
            aria-label={counts === null ? "Task status data is unavailable" : "No task status data available"}
            className="relative flex h-40 w-40 items-center justify-center rounded-full border-[18px] border-ink/10 dark:border-white/10"
          >
            <div className="text-center">
              <p className="font-display text-lg font-semibold text-ink dark:text-slate-50">No data</p>
              <p className="text-xs text-muted dark:text-dark-muted">
                {counts === null ? "Unavailable" : "No tasks yet"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* With shares each row is longer, so the narrowest phones get one column. */}
      <ul
        className={`grid gap-2 text-xs text-muted dark:text-dark-muted ${showShare ? "min-[400px]:grid-cols-2" : "grid-cols-2"}`}
      >
        {TASK_STATUSES.map((status) => (
          <li key={status} className="flex items-center gap-2 rounded-lg bg-ink/5 px-2.5 py-2 dark:bg-white/5">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${taskStatusColors[status].dot}`} />
            {taskStatusLabels[status]}
            {hasData && (
              <span className="ml-auto whitespace-nowrap font-medium text-ink dark:text-slate-100">
                {counts[status]}
                {showShare && (
                  <span className="font-normal text-muted dark:text-dark-muted">
                    {" "}
                    · {Math.round((counts[status] / total) * 100)}%
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
