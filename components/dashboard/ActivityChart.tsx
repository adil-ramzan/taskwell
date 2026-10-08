import { ChartNoAxesCombined } from "lucide-react";

import type { MonthlyActivity } from "@/lib/analytics";
import { taskStatusColors } from "./TaskBadges";

interface ActivityChartProps {
  /** The charted months, oldest first; null when the data couldn't be loaded. */
  months: MonthlyActivity[] | null;
  /** Completed tasks that have no recorded completion date, so aren't in any month. */
  undatedCompleted: number;
}

const createdSwatch = "bg-brand";
// Striped, so the two series differ by more than colour.
const completedStyle = {
  backgroundImage: `repeating-linear-gradient(135deg, ${taskStatusColors.COMPLETED.hex} 0 4px, #6EE7B7 4px 7px)`,
};
const sum = (months: MonthlyActivity[], key: "created" | "completed") =>
  months.reduce((total, month) => total + month[key], 0);

function Bar({ value, max, label, striped }: { value: number; max: number; label: string; striped?: boolean }) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={label}>
      <span className="mb-1 text-[11px] font-medium leading-none text-ink dark:text-slate-100">{value}</span>
      <div
        className={`w-full max-w-7 rounded-t ${striped ? "" : createdSwatch} ${value === 0 ? "bg-ink/10 dark:bg-white/10" : ""}`}
        // A zero keeps a hairline so the month still reads as "nothing", not as missing.
        style={{ height: value === 0 ? 2 : `${Math.max((value / max) * 100, 3)}%`, ...(striped && value > 0 ? completedStyle : {}) }}
      />
    </div>
  );
}

/** Tasks created and completed per UTC calendar month, as bars with the numbers written on them. */
export default function ActivityChart({ months, undatedCompleted }: ActivityChartProps) {
  const created = months ? sum(months, "created") : 0;
  const completed = months ? sum(months, "completed") : 0;
  const hasData = months !== null && created + completed > 0;
  const max = months ? Math.max(1, ...months.flatMap((month) => [month.created, month.completed])) : 1;
  const range = months ? `${months[0].longLabel} to ${months[months.length - 1].longLabel}` : "";

  return (
    <section
      aria-labelledby="activity-chart-heading"
      className="relative min-w-0 rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="activity-chart-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Monthly activity
          </h2>
          <p className="mt-1 text-sm text-muted dark:text-dark-muted">
            {months === null
              ? "Task activity is unavailable right now."
              : hasData
                ? `${created} created and ${completed} completed in the last ${months.length} months.`
                : `No tasks were created or completed in the last ${months.length} months.`}
          </p>
        </div>
        <span className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-muted dark:border-white/10 dark:text-dark-muted">
          Last 6 months
        </span>
      </div>

      {hasData ? (
        <>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted dark:text-dark-muted">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${createdSwatch}`} />
              Created
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={completedStyle} />
              Completed
            </li>
          </ul>
          {/* The bars are decoration for the table below, which carries the same numbers. */}
          <div aria-hidden="true" className="mt-3">
            <div className="flex h-44 items-end gap-2 border-b border-ink/15 dark:border-white/15 sm:h-52 sm:gap-4">
              {months.map((month) => (
                <div key={month.key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                  <Bar value={month.created} max={max} label={`${month.longLabel}: ${month.created} created`} />
                  <Bar
                    value={month.completed}
                    max={max}
                    label={`${month.longLabel}: ${month.completed} completed`}
                    striped
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2 text-[11px] text-muted dark:text-dark-muted sm:gap-4">
              {months.map((month) => (
                <span key={month.key} className="min-w-0 flex-1 text-center">
                  {month.label}
                </span>
              ))}
            </div>
          </div>
          {/* The wrapper is what hides it: a table ignores the 1px width that sr-only sets. */}
          <div className="sr-only">
            <table>
              <caption>Tasks created and completed per month, {range}</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Created</th>
                  <th scope="col">Completed</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.key}>
                    <th scope="row">{month.longLabel}</th>
                    <td>{month.created}</td>
                    <td>{month.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mt-5">
          <div className="relative h-44 sm:h-52">
            <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="border-t border-dashed border-ink/10 dark:border-white/10" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex max-w-xs flex-col items-center px-4 text-center">
                <ChartNoAxesCombined aria-hidden="true" className="h-7 w-7 text-brand/70" />
                <p className="mt-2 text-sm font-medium text-ink dark:text-slate-100">
                  {months === null ? "Activity unavailable" : "No activity to chart"}
                </p>
                <p className="mt-1 text-xs text-muted dark:text-dark-muted">
                  {months === null
                    ? "We couldn't load this chart. Try again in a moment."
                    : "Tasks you create and complete will appear here month by month."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {months !== null && (
        <div className="mt-3 space-y-1 text-xs text-muted dark:text-dark-muted">
          <p>
            Months are calendar months in UTC ({range}). Created counts tasks that still exist; completed counts tasks
            that are completed now, in the month they were last moved to Completed.
          </p>
          {undatedCompleted > 0 && (
            <p className="font-medium text-ink dark:text-slate-100">
              {undatedCompleted} completed {undatedCompleted === 1 ? "task has" : "tasks have"} no recorded completion
              date, so {undatedCompleted === 1 ? "it isn't" : "they aren't"} shown in any month.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
