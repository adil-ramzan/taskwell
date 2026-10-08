import { ChartNoAxesCombined } from "lucide-react";

import { formatDay } from "@/lib/calendar-dates";
import type { TrendUnit } from "@/lib/report-dates";
import type { Report, TrendPoint } from "@/lib/reports";
import { taskStatusColors } from "./TaskBadges";

interface ReportTrendProps {
  /** Null when the range holds too much to chart. */
  trend: Report["trend"];
  /** The range as text, e.g. "Sep 7 – Oct 6, 2026". */
  rangeLabel: string;
  timeZone: string;
}

const createdSwatch = "bg-brand";
// Striped, so the two series differ by more than colour (as on the dashboard chart).
const completedStyle = {
  backgroundImage: `repeating-linear-gradient(135deg, ${taskStatusColors.COMPLETED.hex} 0 4px, #6EE7B7 4px 7px)`,
};
const unitNames: Record<TrendUnit, string> = { day: "day", week: "week", month: "month" };
const sum = (points: TrendPoint[], key: "created" | "completed" | "activity") =>
  points.reduce((total, point) => total + point[key], 0);

/** "Oct 6", "Oct 5 – 11" or "October 2026" (cut to the range at either end). */
function periodLabel(point: TrendPoint, unit: TrendUnit) {
  if (unit === "day") return formatDay(point.from, { weekday: "short", month: "short", day: "numeric" });
  if (point.from === point.to) return formatDay(point.from, { month: "short", day: "numeric" });

  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  return formatter.formatRange(new Date(`${point.from}T12:00:00Z`), new Date(`${point.to}T12:00:00Z`));
}

/** The short text under a bar group. */
function axisLabel(point: TrendPoint, unit: TrendUnit) {
  if (unit === "month") return formatDay(point.from, { month: "short" });

  // The first of a month names the month, so a range across two months stays readable.
  return point.from.endsWith("-01") || unit === "week"
    ? formatDay(point.from, { month: "short", day: "numeric" })
    : String(Number(point.from.slice(8)));
}

function Bar({ value, max, label, striped, showValue }: { value: number; max: number; label: string; striped?: boolean; showValue: boolean }) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={label}>
      {showValue && (
        <span className="mb-1 text-[11px] font-medium leading-none text-ink dark:text-slate-100">{value}</span>
      )}
      <div
        className={`w-full max-w-7 rounded-t ${striped ? "" : createdSwatch} ${value === 0 ? "bg-ink/10 dark:bg-white/10" : ""}`}
        // A zero keeps a hairline so the period still reads as "nothing", not as missing.
        style={{ height: value === 0 ? 2 : `${Math.max((value / max) * 100, 3)}%`, ...(striped && value > 0 ? completedStyle : {}) }}
      />
    </div>
  );
}

/**
 * Tasks created and completed per day, week or month of the report's range,
 * as bars, with the same numbers (and the activity count) in a table anyone
 * can open. Periods are calendar periods in the report's time zone.
 */
export default function ReportTrend({ trend, rangeLabel, timeZone }: ReportTrendProps) {
  const points = trend?.points ?? [];
  const unit = trend?.unit ?? "day";
  const created = sum(points, "created");
  const completed = sum(points, "completed");
  const activity = sum(points, "activity");
  const hasData = created + completed + activity > 0;
  const max = Math.max(1, ...points.flatMap((point) => [point.created, point.completed]));
  // Numbers on the bars and a label under each only while there is room for them.
  const roomy = points.length <= 14;
  const labelEvery = roomy ? 1 : Math.ceil(points.length / 8);

  return (
    <section
      aria-labelledby="report-trend-heading"
      className="min-w-0 rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5"
    >
      <h2 id="report-trend-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
        Activity over time
      </h2>
      <p className="mt-1 text-sm text-muted dark:text-dark-muted">
        {trend === null
          ? "This range holds too much activity to chart. The totals above are still exact; choose a shorter range to see the trend."
          : hasData
            ? `${created} created, ${completed} completed and ${activity} history ${activity === 1 ? "entry" : "entries"} recorded, by ${unitNames[unit]}.`
            : "No tasks were created or completed, and nothing was recorded, in this range."}
      </p>

      {trend !== null && hasData ? (
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
            <div
              className={`flex h-44 items-end border-b border-ink/15 dark:border-white/15 sm:h-52 ${roomy ? "gap-2 sm:gap-3" : "gap-0.5 sm:gap-1.5"}`}
            >
              {points.map((point) => (
                <div
                  key={point.from}
                  className={`flex h-full min-w-0 flex-1 items-end justify-center ${roomy ? "gap-1" : "gap-px"}`}
                >
                  <Bar
                    value={point.created}
                    max={max}
                    showValue={roomy}
                    label={`${periodLabel(point, unit)}: ${point.created} created`}
                  />
                  <Bar
                    value={point.completed}
                    max={max}
                    showValue={roomy}
                    label={`${periodLabel(point, unit)}: ${point.completed} completed`}
                    striped
                  />
                </div>
              ))}
            </div>
            <div className={`mt-2 flex text-[11px] text-muted dark:text-dark-muted ${roomy ? "gap-2 sm:gap-3" : "gap-0.5 sm:gap-1.5"}`}>
              {points.map((point, index) => (
                <span key={point.from} className="min-w-0 flex-1 whitespace-nowrap text-center">
                  {/* Sparse labels may run wider than their own bar group, so they are centred over it instead of clipped. */}
                  {index % labelEvery === 0 && (
                    <span className={roomy ? "" : "inline-flex w-0 justify-center overflow-visible"}>{axisLabel(point, unit)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          <details className="group mt-4 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50">
              <span className="group-open:hidden">Show these numbers as a table</span>
              <span className="hidden group-open:inline">Hide the table</span>
            </summary>
            <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-ink/10 dark:border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Tasks created, tasks completed and history entries per {unitNames[unit]}, {rangeLabel}
                </caption>
                <thead className="sticky top-0 bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted">
                  <tr>
                    <th scope="col" className="px-1.5 py-2 font-medium sm:px-3">
                      {unit === "day" ? "Day" : unit === "week" ? "Week" : "Month"}
                    </th>
                    <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-3">Created</th>
                    <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-3">Completed</th>
                    <th scope="col" className="px-1.5 py-2 text-right font-medium sm:px-3">Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 dark:divide-white/10">
                  {points.map((point) => (
                    <tr key={point.from}>
                      <th scope="row" className="whitespace-nowrap px-1.5 py-2 text-left font-normal text-ink dark:text-slate-100 sm:px-3">
                        {unit === "month"
                          ? formatDay(point.from, { month: "short", year: "numeric" })
                          : unit === "day"
                            ? formatDay(point.from, { month: "short", day: "numeric" })
                            : periodLabel(point, unit)}
                      </th>
                      <td className="px-1.5 py-2 text-right tabular-nums text-ink dark:text-slate-100 sm:px-3">{point.created}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums text-ink dark:text-slate-100 sm:px-3">{point.completed}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums text-ink dark:text-slate-100 sm:px-3">{point.activity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="mt-5 flex h-44 flex-col items-center justify-center rounded-lg border border-dashed border-ink/10 px-4 text-center dark:border-white/10 sm:h-52">
          <ChartNoAxesCombined aria-hidden="true" className="h-7 w-7 text-brand/70" />
          <p className="mt-2 text-sm font-medium text-ink dark:text-slate-100">
            {trend === null ? "Trend not shown" : "No activity to chart"}
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted dark:text-dark-muted">
            {trend === null ? "Too many rows for this range." : `Nothing happened between ${rangeLabel}.`}
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted dark:text-dark-muted">
        {unit === "day" ? "Days" : unit === "week" ? "Weeks (Monday to Sunday)" : "Months"} are calendar periods in{" "}
        {timeZone.replaceAll("_", " ")}. Created counts tasks that still exist; completed counts tasks that are completed
        now, on the date they were last moved to Completed; activity counts entries in the tasks&apos; history.
      </p>
    </section>
  );
}
