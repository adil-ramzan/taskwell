"use client";

import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  CirclePlus,
  ClipboardList,
  Download,
  FolderSearch,
  ListChecks,
  ListTodo,
  Percent,
  RotateCw,
  SearchX,
  SlidersHorizontal,
  Hourglass,
  Timer,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { formatDueDate, isOverdue } from "@/lib/calendar-dates";
import { formatTracked } from "@/lib/time-rules";
import {
  customRangeProblem,
  DEFAULT_REPORT_RANGE,
  REPORT_EXPORT_LIMIT,
  REPORT_LISTS,
  REPORT_MAX_PAGE,
  REPORT_RANGES,
  reportListLabels,
  reportRangeLabels,
  type ReportList,
  type ReportRangePreset,
} from "@/lib/report-dates";
import type { Report, ReportTaskPage } from "@/lib/reports";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import type { TeamMembersByTeam } from "@/lib/teams";
import type { ProjectOption } from "./CreateTaskButton";
import EmptyState from "./EmptyState";
import FormattedDate from "./FormattedDate";
import PageIntro from "./PageIntro";
import PriorityDistribution from "./PriorityDistribution";
import ReportTrend from "./ReportTrend";
import StatCard from "./StatCard";
import StatusDistribution from "./StatusDistribution";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge, TaskStatusBadge } from "./TaskBadges";
import { useTimeZone } from "./TimeZoneContext";
import UserAvatar from "./UserAvatar";

/** What the report shows. It lives in the address, so a refresh, a shared link and Back all restore it. */
type ReportState = {
  range: ReportRangePreset;
  /** "YYYY-MM-DD"; only set for a custom range. */
  from: string;
  to: string;
  scope: "all" | "personal" | "team";
  /** A team ID, or "" for every team; only used with the "team" scope. */
  team: string;
  projectId: string;
  /** "", "me", "unassigned" or a user ID. */
  assignee: string;
  status: TaskStatusValue | "";
  priority: TaskPriorityValue | "";
  list: ReportList;
  page: number;
};

interface ReportsViewProps {
  /** The signed-in user, to leave them out of the "other people" assignee options. */
  userId: string;
  projects: ProjectOption[];
  teams: { id: string; name: string }[];
  teamMembers: TeamMembersByTeam;
}

const surfaceClass =
  "rounded-xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";
const fieldClass =
  "min-h-11 w-full rounded-lg border border-ink/20 bg-white text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";
const selectClass = `${fieldClass} appearance-none truncate pl-3 pr-9`;
const labelClass = "mb-1 block text-xs font-medium text-muted dark:text-dark-muted";
const outlineButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink/15 disabled:hover:text-ink dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-brand dark:focus-visible:ring-offset-dark-background";
const linkClass =
  "rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50";
const headingClass = "font-display text-lg font-semibold text-ink dark:text-slate-50";
const mutedClass = "text-sm text-muted dark:text-dark-muted";
const skeletonClass = "rounded-xl bg-ink/5 motion-safe:animate-pulse dark:bg-white/5";

const oneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  values.includes(value as T);
const taskCount = (count: number) => (count === 1 ? "1 task" : `${count} tasks`);
const percent = (part: number, whole: number) => Math.round((part / whole) * 100);

/**
 * Reads the state from the address. Anything unrecognised falls back to the
 * default; it only restores what was being looked at, and the API checks every
 * value again against the session.
 */
function readState(
  params: URLSearchParams,
  projects: ProjectOption[],
  teams: { id: string }[],
  teamMembers: TeamMembersByTeam,
): ReportState {
  const range = params.get("range");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const scope = params.get("scope");
  const team = params.get("team");
  const project = params.get("project");
  const assignee = params.get("assignee") ?? "";
  const status = params.get("status");
  const priority = params.get("priority");
  const list = params.get("list");
  const page = Number(params.get("page"));
  const custom = range === "custom" && customRangeProblem(from, to) === null;
  const knownPerson = Object.values(teamMembers).some((members) => members.some(({ id }) => id === assignee));
  const inTeams = scope === "team" && teams.length > 0;

  return {
    range: custom ? "custom" : oneOf(REPORT_RANGES, range) && range !== "custom" ? range : DEFAULT_REPORT_RANGE,
    from: custom ? from : "",
    to: custom ? to : "",
    scope: scope === "personal" ? "personal" : inTeams ? "team" : "all",
    team: inTeams ? (teams.find(({ id }) => id === team)?.id ?? "") : "",
    projectId: projects.find(({ id }) => id === project)?.id ?? "",
    assignee: scope !== "personal" && (assignee === "me" || assignee === "unassigned" || knownPerson) ? assignee : "",
    status: oneOf(TASK_STATUSES, status) ? status : "",
    priority: oneOf(TASK_PRIORITIES, priority) ? priority : "",
    list: oneOf(REPORT_LISTS, list) ? list : "all",
    page: Number.isInteger(page) && page >= 1 && page <= REPORT_MAX_PAGE ? page : 1,
  };
}

function writeState(state: ReportState) {
  const params = new URLSearchParams();

  if (state.range !== DEFAULT_REPORT_RANGE) params.set("range", state.range);
  if (state.range === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  if (state.scope !== "all") params.set("scope", state.scope);
  if (state.scope === "team" && state.team) params.set("team", state.team);
  if (state.projectId) params.set("project", state.projectId);
  if (state.assignee) params.set("assignee", state.assignee);
  if (state.status) params.set("status", state.status);
  if (state.priority) params.set("priority", state.priority);
  if (state.list !== "all") params.set("list", state.list);
  if (state.page > 1) params.set("page", String(state.page));

  return params.toString();
}

/** The query string the three report endpoints share: the range, the zone to fall back on, and the filters. */
function apiParams(state: ReportState, timeZone: string) {
  const params = new URLSearchParams({ range: state.range, tz: timeZone });

  if (state.range === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  if (state.scope !== "all") params.set("scope", state.scope);
  if (state.scope === "team" && state.team) params.set("teamId", state.team);
  if (state.projectId) params.set("projectId", state.projectId);
  if (state.assignee) params.set("assignee", state.assignee);
  if (state.status) params.set("status", state.status);
  if (state.priority) params.set("priority", state.priority);

  return params.toString();
}

/** The message to show for a failed request: the server's own, or one for a network failure. */
function failureMessage(reason: unknown, fallback: string) {
  return reason instanceof TypeError
    ? "Unable to reach the server. Check your connection and try again."
    : reason instanceof Error
      ? reason.message
      : fallback;
}

async function getJson<T>(url: string, signal: AbortSignal, fallback: string): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null;

  if (!response.ok || !payload) {
    throw new Error(typeof payload?.error === "string" ? payload.error : fallback);
  }

  return payload;
}

/** "Sep 7 – Oct 6, 2026" for calendar days (not instants). */
function formatDays(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

  return from === to
    ? formatter.format(new Date(`${from}T12:00:00Z`))
    : formatter.formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));
}

/** "40 minutes", "5 hours" or "3.5 days". */
function formatDuration(ms: number) {
  const hours = ms / 3_600_000;

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  if (hours < 48) {
    const rounded = Math.round(hours);
    return rounded === 1 ? "1 hour" : `${rounded} hours`;
  }

  return `${(hours / 24).toFixed(1).replace(/\.0$/, "")} days`;
}

function FilterSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={selectClass}
        >
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

/** A panel that failed to load: what went wrong, and a way to try again. */
function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className={`${surfaceClass} px-6 py-10 text-center`}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">
        <CircleAlert aria-hidden="true" className="h-6 w-6" />
      </span>
      <p className="mt-4 font-display text-lg font-semibold text-ink dark:text-slate-50">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted dark:text-dark-muted">{message}</p>
      <button type="button" onClick={onRetry} className={`${outlineButtonClass} mt-5`}>
        <RotateCw aria-hidden="true" className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}

function OverdueLabel() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
      Overdue
    </span>
  );
}

/** Tasks per assignee in team projects, as labelled bars; each row states its count and share in text. */
function AssigneeBreakdown({ assignees }: { assignees: Report["assignees"] }) {
  const { rows, teamTasks, personalTasks, morePeople, moreTasks } = assignees;
  const nobodyAssigned = rows.length > 0 && rows.every((row) => row.id === null);

  return (
    <section aria-labelledby="report-assignees-heading" className={`${surfaceClass} min-w-0 p-4 sm:p-5`}>
      <h2 id="report-assignees-heading" className={headingClass}>
        Tasks by assignee
      </h2>
      <p className={`mt-1 ${mutedClass}`}>
        {teamTasks === 0
          ? "None of the matching tasks is in a team project, so there is nobody they could be assigned to."
          : nobodyAssigned
            ? "None of the matching team tasks is assigned to anyone yet."
            : `Who the ${taskCount(teamTasks)} in team projects ${teamTasks === 1 ? "is" : "are"} assigned to.`}
      </p>

      {teamTasks > 0 && (
        <ul className="mt-5 space-y-4">
          {rows.map((row) => {
            const share = percent(row.total, teamTasks);

            return (
              <li key={row.id ?? "unassigned"}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-medium text-ink dark:text-slate-100">
                    {row.id !== null && <UserAvatar name={row.name} email={row.email} avatar={row.avatar} size="xs" />}
                    <span className={`truncate ${row.id === null ? "italic" : ""}`}>{row.name}</span>
                  </span>
                  <span className="text-muted dark:text-dark-muted">
                    <span className="font-medium text-ink dark:text-slate-100">{row.total}</span>{" "}
                    {row.total === 1 ? "task" : "tasks"} · {share}% · {row.open} open, {row.completed} completed
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                  <div
                    className={`h-full rounded-full ${row.id === null ? "bg-slate-400 dark:bg-slate-500" : "bg-brand"}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(morePeople > 0 || (personalTasks > 0 && teamTasks > 0)) && (
        <div className="mt-4 space-y-1 text-xs text-muted dark:text-dark-muted">
          {morePeople > 0 && (
            <p>
              {morePeople} more {morePeople === 1 ? "person has" : "people have"} {taskCount(moreTasks)} between them.
            </p>
          )}
          {personalTasks > 0 && teamTasks > 0 && (
            <p>
              {taskCount(personalTasks)} in personal projects can&apos;t be assigned and {personalTasks === 1 ? "isn't" : "aren't"}{" "}
              counted here.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const projectCell = "block md:table-cell md:px-4 md:py-3 md:text-right md:tabular-nums";
const cellLabel = "text-muted dark:text-dark-muted md:hidden";

/** Totals per project. Below md each project is a stacked block (no sideways scrolling); from md up it is a table. */
function ProjectBreakdown({ projects }: { projects: Report["projects"] }) {
  const { rows, matching, inScope } = projects;
  const without = inScope - matching;

  return (
    <section aria-labelledby="report-projects-heading" className={`${surfaceClass} min-w-0 overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <h2 id="report-projects-heading" className={headingClass}>
          Tasks by project
        </h2>
        <p className={`mt-1 ${mutedClass}`}>
          {matching > rows.length
            ? `The ${rows.length} projects with the most matching tasks, of ${matching}.`
            : `${matching === 1 ? "1 project has" : `${matching} projects have`} matching tasks.`}
          {without > 0 &&
            ` ${without === 1 ? "1 other project you can access has" : `${without} other projects you can access have`} none.`}
        </p>
      </div>

      <table className="block w-full border-collapse border-t border-ink/10 text-left text-sm dark:border-white/10 md:table">
        <caption className="sr-only">Matching tasks per project: total, completed, open, overdue and completion rate</caption>
        <thead className="hidden bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted md:table-header-group">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Project</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Completed</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Open</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Overdue</th>
            <th scope="col" className="px-4 py-3 text-right font-medium md:pr-5">Completion rate</th>
          </tr>
        </thead>
        <tbody className="block divide-y divide-ink/10 dark:divide-white/10 md:table-row-group">
          {rows.map((project) => (
            <tr key={project.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-4 md:table-row md:p-0">
              <th scope="row" className="block w-full min-w-0 text-left font-normal md:table-cell md:w-auto md:max-w-xs md:px-5 md:py-3">
                <Link href={`/dashboard/projects/${project.id}`} className={`${linkClass} break-words [overflow-wrap:anywhere]`}>
                  {project.name}
                </Link>
                <span className="block truncate text-xs text-muted dark:text-dark-muted">{project.team ?? "Personal"}</span>
              </th>
              <td className={projectCell}>
                <span className={cellLabel}>Total </span>
                <span className="font-medium text-ink dark:text-slate-100">{project.total}</span>
              </td>
              <td className={projectCell}>
                <span className={cellLabel}>Completed </span>
                <span className="text-ink dark:text-slate-100">{project.completed}</span>
              </td>
              <td className={projectCell}>
                <span className={cellLabel}>Open </span>
                <span className="text-ink dark:text-slate-100">{project.open}</span>
              </td>
              <td className={projectCell}>
                <span className={cellLabel}>Overdue </span>
                <span className={project.overdue > 0 ? "font-medium text-red-700 dark:text-red-300" : "text-ink dark:text-slate-100"}>
                  {project.overdue}
                </span>
              </td>
              <td className={`${projectCell} md:pr-5`}>
                <span className={cellLabel}>Completion rate </span>
                <span className="text-ink dark:text-slate-100">{percent(project.completed, project.total)}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const taskCell = "block min-w-0 xl:table-cell xl:px-3 xl:py-3";
const taskCellLabel = "text-muted dark:text-dark-muted xl:hidden";

/** One page of tasks. Below xl each task is a stacked block; from xl up it is a table. */
function TaskTable({ page, timeZone, now }: { page: ReportTaskPage; timeZone: string; now: Date }) {
  return (
    <table className="block w-full border-collapse border-t border-ink/10 text-left text-sm dark:border-white/10 xl:table">
      <caption className="sr-only">
        {reportListLabels[page.list]}: page {page.page} of {page.pageCount}
      </caption>
      <thead className="hidden bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted xl:table-header-group">
        <tr>
          <th scope="col" className="px-5 py-3 font-medium">Task</th>
          <th scope="col" className="px-3 py-3 font-medium">Project</th>
          <th scope="col" className="px-3 py-3 font-medium">Status</th>
          <th scope="col" className="px-3 py-3 font-medium">Priority</th>
          <th scope="col" className="px-3 py-3 font-medium">Assignee</th>
          <th scope="col" className="px-3 py-3 font-medium">Due</th>
          <th scope="col" className="px-3 py-3 font-medium">Created</th>
          <th scope="col" className="px-3 py-3 font-medium">Completed</th>
          <th scope="col" className="px-3 py-3 text-right font-medium xl:pr-5">Time tracked</th>
        </tr>
      </thead>
      <tbody className="block divide-y divide-ink/10 dark:divide-white/10 xl:table-row-group">
        {page.tasks.map((task) => (
          <tr key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 xl:table-row xl:p-0">
            <th scope="row" className="block w-full min-w-0 text-left font-normal xl:table-cell xl:w-auto xl:max-w-[16rem] xl:px-5 xl:py-3">
              <Link href={`/dashboard/tasks/${task.id}`} className={`${linkClass} break-words [overflow-wrap:anywhere]`}>
                {task.title}
              </Link>
              {task.parent && (
                <span className="mt-0.5 block break-words text-xs text-muted [overflow-wrap:anywhere] dark:text-dark-muted">
                  Subtask of {task.parent.title}
                </span>
              )}
              {task.recurring && (
                <span className="mt-0.5 block text-xs text-muted dark:text-dark-muted">Repeating task</span>
              )}
            </th>
            <td className={`${taskCell} w-full break-words text-muted [overflow-wrap:anywhere] dark:text-dark-muted xl:w-auto xl:max-w-[11rem]`}>
              <span className="xl:hidden">In </span>
              {task.project.name}
              <span className="block truncate text-xs">{task.project.team ?? "Personal"}</span>
            </td>
            <td className={taskCell}>
              <span className="sr-only xl:hidden">Status: </span>
              <TaskStatusBadge status={task.status} />
            </td>
            <td className={taskCell}>
              <span className="sr-only xl:hidden">Priority: </span>
              <TaskPriorityBadge priority={task.priority} />
            </td>
            <td className={`${taskCell} max-w-full xl:max-w-[10rem]`}>
              <span className="sr-only xl:hidden">Assignee: </span>
              {/* Personal tasks can't be assigned, so they show no assignee at all. */}
              {task.project.team ? (
                <TaskAssignee assignee={task.assignee} compact />
              ) : (
                <span className="hidden text-muted dark:text-dark-muted xl:inline" aria-label="Not applicable">
                  –
                </span>
              )}
            </td>
            <td className={`${taskCell} w-full xl:w-auto`}>
              <span className={taskCellLabel}>Due </span>
              {task.dueDate ? (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-ink dark:text-slate-100">
                  <time dateTime={task.dueDate}>{formatDueDate(task.dueDate, timeZone)}</time>
                  {isOverdue(task, now) && <OverdueLabel />}
                </span>
              ) : (
                <span className="italic text-muted dark:text-dark-muted">No due date</span>
              )}
            </td>
            <td className={`${taskCell} text-muted dark:text-dark-muted xl:whitespace-nowrap`}>
              <span className="xl:hidden">Created </span>
              <FormattedDate value={task.createdAt} timeZone={timeZone} />
            </td>
            <td className={`${taskCell} text-muted dark:text-dark-muted xl:whitespace-nowrap`}>
              {task.completedAt ? (
                <>
                  <span className="xl:hidden">Completed </span>
                  <FormattedDate value={task.completedAt} timeZone={timeZone} />
                </>
              ) : task.status === "COMPLETED" ? (
                <span title="Completed before task history was recorded, or created as Completed.">
                  <span className="xl:hidden">Completed, </span>date not recorded
                </span>
              ) : (
                <span className="hidden xl:inline" aria-label="Not completed">
                  –
                </span>
              )}
            </td>
            <td className={`${taskCell} text-muted dark:text-dark-muted xl:whitespace-nowrap xl:pr-5 xl:text-right`}>
              {task.trackedSeconds > 0 ? (
                <>
                  <span className="xl:hidden">Tracked </span>
                  {formatTracked(task.trackedSeconds)}
                </>
              ) : (
                <span className="hidden xl:inline" aria-label="No time tracked in the range">
                  –
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Reports: figures, breakdowns and a task list for the tasks this user can
 * access, with a CSV export of that list. Everything is asked from
 * /api/reports with the chosen range and filters; the server decides what the
 * user may see and does all the counting. Days are calendar days in the
 * account's time zone (Settings), or the browser's when none is saved.
 */
export default function ReportsView({ userId, projects, teams, teamMembers }: ReportsViewProps) {
  const timeZone = useTimeZone();
  const filtersId = useId();
  const customErrorId = useId();
  const exportHelpId = useId();
  const searchParams = useSearchParams();
  const state = useMemo(
    () => readState(new URLSearchParams(searchParams.toString()), projects, teams, teamMembers),
    [searchParams, projects, teams, teamMembers],
  );
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState("");
  const [tasks, setTasks] = useState<ReportTaskPage | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState("");
  const [reloads, setReloads] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The custom dates as typed; they only reach the address (and the server) once they make a valid range.
  const [draft, setDraft] = useState({ from: state.from, to: state.to });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ kind: "done" | "error"; text: string } | null>(null);

  const { range, scope, team, projectId, assignee, status, priority, list, page } = state;
  const query = timeZone ? apiParams(state, timeZone) : null;

  /** Changing the range or a filter adds a history entry, so Back steps through what was looked at. */
  const update = useCallback(
    (changes: Partial<ReportState>, mode: "push" | "replace" = "push") => {
      // Any change other than turning the page starts the list from its first page again.
      const next = writeState({ ...state, page: 1, ...changes });
      const url = `${window.location.pathname}${next ? `?${next}` : ""}`;

      if (mode === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
    },
    [state],
  );
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  useEffect(() => {
    setDraft({ from: state.from, to: state.to });
  }, [state.from, state.to]);

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();

    setReportLoading(true);
    setReportError("");

    getJson<Report>(`/api/reports?${query}`, controller.signal, "We couldn't load this report right now. Please try again.")
      .then((payload) => {
        setReport(payload);
        setReportLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;

        // Never leave an earlier report on screen as if it answered this request.
        setReport(null);
        setReportLoading(false);
        setReportError(failureMessage(reason, "We couldn't load this report right now. Please try again."));
      });

    return () => controller.abort();
  }, [query, reloads]);

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();

    setTasksLoading(true);
    setTasksError("");

    getJson<ReportTaskPage>(
      `/api/reports/tasks?${query}&list=${list}&page=${page}`,
      controller.signal,
      "We couldn't load this report's tasks right now. Please try again.",
    )
      .then((payload) => {
        setTasks(payload);
        setTasksLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;

        setTasks(null);
        setTasksLoading(false);
        setTasksError(failureMessage(reason, "We couldn't load this report's tasks right now. Please try again."));
      });

    return () => controller.abort();
  }, [query, list, page, reloads]);

  // A page past the end (an old link, or tasks removed since) moves to the last page that exists.
  useEffect(() => {
    if (tasks && !tasksLoading && tasks.page === page && tasks.list === list && page > tasks.pageCount) {
      update({ page: tasks.pageCount }, "replace");
    }
  }, [tasks, tasksLoading, page, list, update]);

  useEffect(() => {
    setExportMessage(null);
  }, [query, list]);

  // The filters only offer what fits the scope; the server applies the same narrowing whatever is sent.
  const fits = (teamId: string | null, nextScope = scope, nextTeam = team) =>
    nextScope === "all" || (nextScope === "personal" ? teamId === null : nextTeam ? teamId === nextTeam : teamId !== null);
  const scopedProjects = projects.filter((project) => fits(project.teamId));
  const people = useMemo(() => {
    const teamIds = scope === "personal" ? [] : team ? [team] : teams.map(({ id }) => id);
    const byId = new Map<string, string>();

    for (const teamId of teamIds) {
      for (const member of teamMembers[teamId] ?? []) {
        if (member.id !== userId) byId.set(member.id, member.name);
      }
    }

    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [scope, team, teams, teamMembers, userId]);
  const activeFilters = [scope !== "all", projectId, assignee, status, priority].filter(Boolean).length;
  const hasTeams = teams.length > 0;

  /** Moves to a scope/team, dropping a project or person that the new one can't contain. */
  function changeScope(nextScope: ReportState["scope"], nextTeam: string) {
    const project = projects.find(({ id }) => id === projectId);
    const stillThere =
      assignee === "me" ||
      assignee === "unassigned" ||
      (nextTeam ? teamMembers[nextTeam] ?? [] : Object.values(teamMembers).flat()).some(({ id }) => id === assignee);

    update({
      scope: nextScope,
      team: nextScope === "team" ? nextTeam : "",
      projectId: project && fits(project.teamId, nextScope, nextTeam) ? projectId : "",
      assignee: nextScope !== "personal" && stillThere ? assignee : "",
    });
  }

  function changeRange(next: ReportRangePreset) {
    if (next !== "custom") {
      update({ range: next, from: "", to: "" });
      return;
    }

    // Starts from the days on screen, so choosing "Custom range" changes nothing until a date is edited.
    if (report) update({ range: "custom", from: report.range.from, to: report.range.to });
  }

  function changeDraft(changes: Partial<typeof draft>) {
    const next = { ...draft, ...changes };

    setDraft(next);
    if (customRangeProblem(next.from, next.to) === null) update({ range: "custom", from: next.from, to: next.to });
  }

  async function exportCsv() {
    if (!query) return;

    setExporting(true);
    setExportMessage(null);

    try {
      const response = await fetch(`/api/reports/export?format=csv&${query}&list=${list}`, { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

        throw new Error(
          typeof payload?.error === "string" ? payload.error : "We couldn't export this report right now. Please try again.",
        );
      }

      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "taskwell-report.csv";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");

      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage({ kind: "done", text: `Downloaded ${name}.` });
    } catch (reason) {
      setExportMessage({
        kind: "error",
        text: failureMessage(reason, "We couldn't export this report right now. Please try again."),
      });
    } finally {
      setExporting(false);
    }
  }

  const draftProblem =
    range === "custom" && (draft.from !== state.from || draft.to !== state.to) ? customRangeProblem(draft.from, draft.to) : null;
  const tooManyToExport = tasks !== null && tasks.total > REPORT_EXPORT_LIMIT;
  const canExport = tasks !== null && !tasksLoading && tasks.total > 0 && !tooManyToExport && !reportError;
  const exportHelp =
    tasks === null || tasksLoading
      ? ""
      : tasks.total === 0
        ? "There are no tasks to export for this selection."
        : tooManyToExport
          ? `This selection has ${tasks.total} tasks; an export holds at most ${REPORT_EXPORT_LIMIT}. Narrow the filters or the range.`
          : `Exports ${taskCount(tasks.total)}: ${reportListLabels[list].toLowerCase()}.`;

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <PageIntro title="Reports" description="Measure progress across the projects you can access, and export the tasks behind it." />
      <div className="flex flex-col gap-1 sm:items-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={!canExport || exporting}
          aria-describedby={exportHelpId}
          className={primaryButtonClass}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {exporting ? "Preparing CSV…" : "Export CSV"}
        </button>
        <p id={exportHelpId} className="text-xs text-muted dark:text-dark-muted sm:max-w-xs sm:text-right">
          {exportHelp}
        </p>
      </div>
    </div>
  );

  // Until the time zone is known there is no "today" to count a range from.
  if (!timeZone) {
    return (
      <div className="space-y-6">
        {header}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading report…</span>
          <div aria-hidden="true" className={`${skeletonClass} h-[28rem]`} />
        </div>
      </div>
    );
  }

  const summary = report?.summary;
  const rangeLabel = report ? formatDays(report.range.from, report.range.to) : "";
  const zoneLabel = (report?.timeZone ?? timeZone).replaceAll("_", " ");
  const now = report ? new Date(report.generatedAt) : new Date();
  const nothingExists = report?.workspace?.tasks === 0;
  const nothingMatches = summary?.total === 0;
  const quietRange =
    summary !== undefined && summary.total > 0 && summary.created + summary.completed + summary.due + summary.activity === 0;
  const rate = summary?.completionRate;

  return (
    <div className="space-y-6">
      {header}

      {exportMessage && (
        <p
          role={exportMessage.kind === "error" ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            exportMessage.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
              : "border-ink/10 bg-paper text-ink dark:border-white/10 dark:bg-dark-background dark:text-slate-100"
          }`}
        >
          {exportMessage.text}
        </p>
      )}

      <section aria-label="Report settings" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="grid gap-3 sm:grid-cols-3 lg:flex-1 lg:grid-cols-[minmax(0,14rem)_minmax(0,11rem)_minmax(0,11rem)]">
            <FilterSelect label="Date range" value={range} onChange={(value) => changeRange(value as ReportRangePreset)}>
              {REPORT_RANGES.map((option) => (
                <option key={option} value={option}>
                  {reportRangeLabels[option]}
                </option>
              ))}
            </FilterSelect>
            {range === "custom" && (
              <>
                <div className="min-w-0">
                  <label htmlFor={`${filtersId}-from`} className={labelClass}>
                    From
                  </label>
                  <input
                    id={`${filtersId}-from`}
                    type="date"
                    value={draft.from}
                    max={draft.to || undefined}
                    aria-invalid={draftProblem ? true : undefined}
                    aria-describedby={draftProblem ? customErrorId : undefined}
                    onChange={(event) => changeDraft({ from: event.target.value })}
                    className={`${fieldClass} px-3`}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${filtersId}-to`} className={labelClass}>
                    To
                  </label>
                  <input
                    id={`${filtersId}-to`}
                    type="date"
                    value={draft.to}
                    min={draft.from || undefined}
                    aria-invalid={draftProblem ? true : undefined}
                    aria-describedby={draftProblem ? customErrorId : undefined}
                    onChange={(event) => changeDraft({ to: event.target.value })}
                    className={`${fieldClass} px-3`}
                  />
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
            className={`${outlineButtonClass} lg:hidden`}
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
                {activeFilters}
                <span className="sr-only"> active</span>
              </span>
            )}
          </button>
        </div>

        {draftProblem && (
          <p id={customErrorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
            {draftProblem} The report still shows {state.from && state.to ? formatDays(state.from, state.to) : "the previous range"}.
          </p>
        )}

        {/* Always shown from lg up; behind the Filters button on smaller screens. */}
        <div
          id={filtersId}
          role="group"
          aria-label="Filter the report"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto] xl:items-end`}
        >
          {/* Without teams, "all" and "personal" are the same thing, and nothing can be assigned. */}
          {hasTeams && (
            <>
              <FilterSelect label="Scope" value={scope} onChange={(value) => changeScope(value as ReportState["scope"], "")}>
                <option value="all">All my work</option>
                <option value="personal">Personal projects</option>
                <option value="team">{teams.length === 1 ? "Team projects" : "All team projects"}</option>
              </FilterSelect>
              <FilterSelect
                label="Team"
                value={scope === "team" ? team : ""}
                disabled={scope === "personal"}
                onChange={(value) => changeScope(value ? "team" : scope, value)}
              >
                <option value="">{scope === "personal" ? "No team" : "All my teams"}</option>
                {teams.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </FilterSelect>
            </>
          )}
          <FilterSelect label="Project" value={projectId} onChange={(value) => update({ projectId: value })}>
            <option value="">All projects</option>
            {scopedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </FilterSelect>
          {hasTeams && (
            <FilterSelect
              label="Assignee"
              value={scope === "personal" ? "" : assignee}
              disabled={scope === "personal"}
              onChange={(value) => update({ assignee: value })}
            >
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </FilterSelect>
          )}
          <FilterSelect label="Status" value={status} onChange={(value) => update({ status: value as TaskStatusValue | "" })}>
            <option value="">Any status</option>
            {TASK_STATUSES.map((option) => (
              <option key={option} value={option}>
                {taskStatusLabels[option]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(value) => update({ priority: value as TaskPriorityValue | "" })}
          >
            <option value="">Any priority</option>
            {TASK_PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {taskPriorityLabels[option]}
              </option>
            ))}
          </FilterSelect>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => update({ scope: "all", team: "", projectId: "", assignee: "", status: "", priority: "" })}
              className={outlineButtonClass}
            >
              Clear filters
            </button>
          )}
        </div>

        <div role="status" className={mutedClass}>
          {reportLoading
            ? report
              ? "Updating report…"
              : "Loading report…"
            : report
              ? `${rangeLabel} · ${report.range.days === 1 ? "1 day" : `${report.range.days} days`} · days and times in ${zoneLabel}${
                  activeFilters > 0 ? ` · ${activeFilters === 1 ? "1 filter" : `${activeFilters} filters`} applied` : ""
                }`
              : ""}
        </div>
      </section>

      {reportError ? (
        <LoadError title="The report couldn't be loaded" message={reportError} onRetry={reload} />
      ) : !report || !summary || !rate ? (
        <div aria-hidden="true" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className={`${skeletonClass} h-32`} />
            ))}
          </div>
          <div className={`${skeletonClass} h-72`} />
        </div>
      ) : nothingMatches ? (
        <div className={surfaceClass}>
          {nothingExists ? (
            <EmptyState
              icon={ClipboardList}
              title="Nothing to report on yet"
              description={
                report.workspace?.projects === 0
                  ? "You don't have any projects yet. Create a project and add tasks to it, and their progress will be reported here."
                  : "None of your projects has a task yet. Add tasks and their progress will be reported here."
              }
            >
              <Link href={report.workspace?.projects === 0 ? "/dashboard/projects" : "/dashboard/tasks"} className={outlineButtonClass}>
                {report.workspace?.projects === 0 ? "Go to projects" : "Go to tasks"}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon={SearchX}
              title="No tasks match these filters"
              description="There are tasks you can access, but none with this combination of scope, project, assignee, status and priority."
            >
              <button
                type="button"
                onClick={() => update({ scope: "all", team: "", projectId: "", assignee: "", status: "", priority: "" })}
                className={outlineButtonClass}
              >
                Clear filters
              </button>
            </EmptyState>
          )}
        </div>
      ) : (
        <div aria-busy={reportLoading} className={`space-y-6 ${reportLoading ? "opacity-60" : ""}`}>
          <section aria-labelledby="report-summary-heading">
            <h2 id="report-summary-heading" className="sr-only">
              Summary
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total tasks"
                icon={ListChecks}
                value={summary.total}
                description={activeFilters > 0 ? "Tasks matching the filters, whatever their dates." : "Every task you can access, whatever its dates."}
              />
              <StatCard
                label="Open tasks"
                icon={ListTodo}
                value={summary.open}
                description="Matching tasks that aren't completed, as of now."
              />
              <StatCard
                label="Overdue tasks"
                icon={TriangleAlert}
                value={summary.overdue}
                description="Open tasks whose due date has passed, as of now."
              />
              <StatCard
                label="Completion rate"
                icon={Percent}
                value={rate.eligible > 0 ? `${percent(rate.completed, rate.eligible)}%` : null}
                description={
                  rate.eligible > 0
                    ? `${rate.completed} completed in the range, of ${taskCount(rate.eligible)} that ${rate.eligible === 1 ? "was" : "were"} open during it.`
                    : "No matching task was open during this range."
                }
              />
              <StatCard
                label="Created in range"
                icon={CirclePlus}
                value={summary.created}
                description={`Matching tasks created ${rangeLabel}.`}
              />
              <StatCard
                label="Completed in range"
                icon={CircleCheckBig}
                value={summary.completed}
                description={`Completed now, and last moved to Completed ${rangeLabel}.`}
              />
              <StatCard
                label="Due in range"
                icon={CalendarClock}
                value={summary.due}
                description={`Matching tasks, open or completed, due ${rangeLabel}.`}
              />
              <StatCard
                label="Average completion time"
                icon={Timer}
                value={summary.averageCompletionMs === null ? null : formatDuration(summary.averageCompletionMs)}
                description={
                  summary.averageCompletionMs === null
                    ? summary.completed === 0
                      ? "No matching task was completed in this range."
                      : "Too many completions in this range to average."
                    : `From creation to completion, for the ${taskCount(summary.completed)} completed in the range.`
                }
              />
              <StatCard
                label="Time tracked in range"
                icon={Hourglass}
                value={formatTracked(summary.trackedSeconds)}
                description={
                  summary.trackedSeconds === 0
                    ? `No time was tracked on matching tasks ${rangeLabel}.`
                    : `Finished time entries on matching tasks ${rangeLabel}. Running timers aren't counted.`
                }
              />
            </div>
            {(quietRange || summary.undatedCompleted > 0) && (
              <div className="mt-3 space-y-1 text-sm text-muted dark:text-dark-muted">
                {quietRange && (
                  <p className="font-medium text-ink dark:text-slate-100">
                    Nothing happened in this range: no matching task was created, completed or due, and no activity was recorded.
                  </p>
                )}
                {summary.undatedCompleted > 0 && (
                  <p>
                    {summary.undatedCompleted} completed {summary.undatedCompleted === 1 ? "task has" : "tasks have"} no recorded
                    completion date, so {summary.undatedCompleted === 1 ? "it isn't" : "they aren't"} counted as completed in any
                    range or in the completion rate.
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
            <ReportTrend trend={report.trend} rangeLabel={rangeLabel} timeZone={report.timeZone} />
            <StatusDistribution
              counts={report.statusCounts}
              showShare
              description="All matching tasks by their status now."
            />
            <AssigneeBreakdown assignees={report.assignees} />
            <PriorityDistribution counts={report.priorityCounts} description="All matching tasks by priority." />
          </div>

          <ProjectBreakdown projects={report.projects} />
        </div>
      )}

      {/* The list of tasks behind the figures; hidden when the report itself failed or has nothing to list. */}
      {!reportError && report && !nothingMatches && (
        <section aria-labelledby="report-tasks-heading" className={`${surfaceClass} min-w-0 overflow-hidden`}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div className="min-w-0">
              <h2 id="report-tasks-heading" className={headingClass}>
                Tasks
              </h2>
              <p role="status" className={`mt-1 ${mutedClass}`}>
                {tasksLoading
                  ? "Loading tasks…"
                  : tasks
                    ? `${tasks.total === 0 ? "No tasks" : taskCount(tasks.total)}${list === "all" ? "" : ` · ${reportListLabels[list].toLowerCase()} (${rangeLabel})`}`
                    : ""}
              </p>
            </div>
            <div className="w-full sm:w-64">
              <FilterSelect label="Tasks to list" value={list} onChange={(value) => update({ list: value as ReportList })}>
                {REPORT_LISTS.map((option) => (
                  <option key={option} value={option}>
                    {reportListLabels[option]}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </div>

          {tasksError ? (
            <div className="border-t border-ink/10 p-4 dark:border-white/10 sm:p-5">
              <LoadError title="The tasks couldn't be loaded" message={tasksError} onRetry={reload} />
            </div>
          ) : !tasks ? (
            <div aria-hidden="true" className={`${skeletonClass} mx-4 mb-4 h-64 sm:mx-5 sm:mb-5`} />
          ) : tasks.total === 0 ? (
            !tasksLoading && (
              <div className="border-t border-ink/10 dark:border-white/10">
                <EmptyState
                  icon={FolderSearch}
                  title={
                    list === "created"
                      ? "No tasks created in this range"
                      : list === "completed"
                        ? "No tasks completed in this range"
                        : list === "due"
                          ? "No tasks due in this range"
                          : "No tasks to list"
                  }
                  description={
                    list === "due"
                      ? "No matching task has a due date in this range. Tasks without a due date are never listed here."
                      : list === "completed"
                        ? "No matching task was moved to Completed in this range and is still completed."
                        : "Choose a longer range, or list all matching tasks instead."
                  }
                />
              </div>
            )
          ) : (
            <div aria-busy={tasksLoading} className={tasksLoading ? "opacity-60" : undefined}>
              <TaskTable page={tasks} timeZone={report.timeZone} now={now} />
              {tasks.pageCount > 1 && (
                <nav
                  aria-label="Task pages"
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 dark:border-white/10 sm:px-5"
                >
                  <p className={mutedClass}>
                    Page {tasks.page} of {tasks.pageCount}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={tasks.page <= 1}
                      onClick={() => update({ page: tasks.page - 1 })}
                      className={outlineButtonClass}
                    >
                      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={tasks.page >= tasks.pageCount}
                      onClick={() => update({ page: tasks.page + 1 })}
                      className={outlineButtonClass}
                    >
                      Next
                      <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </nav>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
