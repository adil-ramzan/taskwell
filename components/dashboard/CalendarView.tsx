"use client";

import {
  CalendarDays,
  CalendarX,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Plus,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import type { CalendarTask } from "@/lib/calendar";
import {
  CALENDAR_VIEWS,
  calendarViewLabels,
  dayKeyOf,
  formatDay,
  formatDueTime,
  formatRangeTitle,
  isDayKey,
  isOverdue,
  rangeOfDays,
  shiftAnchor,
  visibleDays,
  type CalendarView as CalendarViewName,
} from "@/lib/calendar-dates";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import type { TeamMembersByTeam } from "@/lib/teams";
import CreateTaskButton, { type ProjectOption } from "./CreateTaskButton";
import EmptyState from "./EmptyState";
import PageIntro from "./PageIntro";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge, TaskStatusBadge, taskStatusColors } from "./TaskBadges";
import { useTimeZone } from "./TimeZoneContext";

/** What is being looked at. It lives in the address, so Back from a task returns to the same place. */
type CalendarState = {
  view: CalendarViewName;
  /** "YYYY-MM-DD", or null for today. */
  date: string | null;
  /** "all", "personal", "team" (every team) or a team ID. */
  scope: string;
  projectId: string;
  /** "", "me", "unassigned" or a user ID. */
  assignee: string;
  status: TaskStatusValue | "";
  priority: TaskPriorityValue | "";
};

interface CalendarViewProps {
  /** The signed-in user, to leave them out of the "other people" assignee options. */
  userId: string;
  projects: ProjectOption[];
  teams: { id: string; name: string }[];
  teamMembers: TeamMembersByTeam;
}

type Loaded = { tasks: CalendarTask[]; truncated: boolean };

const MONTH_CHIPS = 3;

const surfaceClass =
  "rounded-xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";
const selectClass =
  "min-h-11 w-full appearance-none truncate rounded-lg border border-ink/20 bg-white pl-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";
const outlineButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const iconButtonClass = `${outlineButtonClass} w-11 px-0`;
const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const todayPillClass =
  "rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white";

const oneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  values.includes(value as T);

/**
 * Reads the state from the address. Anything unrecognised falls back to the
 * default; it only restores what was being looked at, and the API checks every
 * value again against the session.
 */
function readState(
  params: URLSearchParams,
  projects: ProjectOption[],
  teams: { id: string }[],
): CalendarState {
  const view = params.get("view");
  const date = params.get("date");
  const scope = params.get("scope");
  const team = params.get("team");
  const project = params.get("project");
  const status = params.get("status");
  const priority = params.get("priority");

  return {
    view: oneOf(CALENDAR_VIEWS, view) ? view : "month",
    date: isDayKey(date) ? date : null,
    scope:
      scope === "personal" ? "personal" : scope === "team" ? (teams.find(({ id }) => id === team)?.id ?? "team") : "all",
    projectId: projects.find(({ id }) => id === project)?.id ?? "",
    assignee: (params.get("assignee") ?? "").slice(0, 100),
    status: oneOf(TASK_STATUSES, status) ? status : "",
    priority: oneOf(TASK_PRIORITIES, priority) ? priority : "",
  };
}

function writeState(state: CalendarState) {
  const params = new URLSearchParams();

  if (state.view !== "month") params.set("view", state.view);
  if (state.date) params.set("date", state.date);
  if (state.scope === "personal") params.set("scope", "personal");
  else if (state.scope !== "all") {
    params.set("scope", "team");
    if (state.scope !== "team") params.set("team", state.scope);
  }
  if (state.projectId) params.set("project", state.projectId);
  if (state.assignee) params.set("assignee", state.assignee);
  if (state.status) params.set("status", state.status);
  if (state.priority) params.set("priority", state.priority);

  return params.toString();
}

const taskHref = (task: CalendarTask) => `/dashboard/tasks/${task.id}`;
const taskCount = (count: number) => (count === 1 ? "1 task" : `${count} tasks`);

/** Everything a sighted user gets from a task's entry, as one sentence for screen readers. */
function describeTask(task: CalendarTask, timeZone: string, now: Date) {
  return [
    task.title,
    `due ${formatDueTime(task.dueDate, timeZone) ?? "any time that day"}`,
    isOverdue(task, now) ? "overdue" : null,
    task.project.name,
    taskStatusLabels[task.status],
    `${taskPriorityLabels[task.priority]} priority`,
    task.assignee ? `assigned to ${task.assignee.name}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function OverdueLabel() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
      <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
      Overdue
    </span>
  );
}

type EntryProps = { task: CalendarTask; timeZone: string; now: Date };

/** One line in a month cell: status marker, time and title. The full details are in its label and tooltip. */
function TaskChip({ task, timeZone, now }: EntryProps) {
  const label = describeTask(task, timeZone, now);
  const time = formatDueTime(task.dueDate, timeZone);
  const done = task.status === "COMPLETED";

  return (
    <Link
      href={taskHref(task)}
      aria-label={label}
      title={label}
      className={`flex min-h-6 items-center gap-1.5 rounded-md bg-ink/5 px-1.5 text-xs text-ink hover:bg-brand/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-brand/25 ${focusRing}`}
    >
      {/* Shape as well as colour: a tick when completed, an alert when overdue, otherwise the status dot. */}
      {done ? (
        <Check aria-hidden="true" className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : isOverdue(task, now) ? (
        <CircleAlert aria-hidden="true" className="h-3 w-3 shrink-0 text-red-600 dark:text-red-400" />
      ) : (
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${taskStatusColors[task.status].dot}`} />
      )}
      <span className={`min-w-0 truncate ${done ? "text-muted line-through dark:text-dark-muted" : ""}`}>
        {time && <span className="text-muted dark:text-dark-muted">{time} </span>}
        {task.title}
      </span>
    </Link>
  );
}

/** A compact card for a week column: every detail is written out, since the column is narrow. */
function TaskCard({ task, timeZone, now }: EntryProps) {
  return (
    <Link
      href={taskHref(task)}
      aria-label={describeTask(task, timeZone, now)}
      className={`block rounded-lg border border-ink/10 bg-paper p-2 text-xs hover:border-brand dark:border-white/10 dark:bg-dark-background ${focusRing}`}
    >
      <span className="block font-medium text-muted dark:text-dark-muted">
        {formatDueTime(task.dueDate, timeZone) ?? "Any time"}
      </span>
      <span
        className={`mt-0.5 line-clamp-2 break-words text-sm font-medium ${
          task.status === "COMPLETED" ? "text-muted line-through dark:text-dark-muted" : "text-ink dark:text-slate-50"
        }`}
      >
        {task.title}
      </span>
      <span className="mt-0.5 block truncate text-muted dark:text-dark-muted">{task.project.name}</span>
      <span className="mt-1 flex items-start gap-1.5 text-ink dark:text-slate-100">
        <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${taskStatusColors[task.status].dot}`} />
        <span className="min-w-0 break-words">
          {taskStatusLabels[task.status]} · {taskPriorityLabels[task.priority]}
        </span>
      </span>
      {isOverdue(task, now) && (
        <span className="mt-1.5 block">
          <OverdueLabel />
        </span>
      )}
    </Link>
  );
}

/** A full-width entry for the day and agenda views (and the week view on small screens). */
function TaskRow({ task, timeZone, now }: EntryProps) {
  return (
    <li>
      <Link
        href={taskHref(task)}
        aria-label={describeTask(task, timeZone, now)}
        className={`flex flex-col gap-2 px-4 py-3 hover:bg-ink/[0.03] dark:hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4 ${focusRing} focus-visible:ring-inset`}
      >
        <span className="w-20 shrink-0 text-sm font-medium text-muted dark:text-dark-muted">
          {formatDueTime(task.dueDate, timeZone) ?? "Any time"}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block break-words font-medium ${
              task.status === "COMPLETED"
                ? "text-muted line-through dark:text-dark-muted"
                : "text-ink dark:text-slate-50"
            }`}
          >
            {task.title}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted dark:text-dark-muted">{task.project.name}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {isOverdue(task, now) && <OverdueLabel />}
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {/* Personal tasks can't be assigned, so they show no assignee at all. */}
          {task.project.teamId && (
            <span className="inline-flex min-w-0 max-w-[12rem]">
              <TaskAssignee assignee={task.assignee} compact />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
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
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted dark:text-dark-muted">
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

type ViewProps = {
  days: string[];
  byDay: Map<string, CalendarTask[]>;
  today: string;
  timeZone: string;
  now: Date;
  /** Opens the day view for a day. */
  openDay: (day: string) => void;
};

function DayHeading({ day, today, count }: { day: string; today: string; count: number }) {
  return (
    <h3 className="flex flex-wrap items-center gap-2 border-b border-ink/10 bg-paper px-4 py-2 text-sm font-semibold text-ink dark:border-white/10 dark:bg-dark-background dark:text-slate-50">
      {formatDay(day, { weekday: "long", month: "long", day: "numeric" })}
      {day === today && <span className={todayPillClass}>Today</span>}
      <span className="font-normal text-muted dark:text-dark-muted">{taskCount(count)}</span>
    </h3>
  );
}

function MonthView({ days, byDay, today, timeZone, now, openDay, month }: ViewProps & { month: string }) {
  return (
    <div className={`${surfaceClass} overflow-hidden`}>
      <div
        aria-hidden="true"
        className="grid grid-cols-7 border-b border-ink/10 text-center text-xs font-medium text-muted dark:border-white/10 dark:text-dark-muted"
      >
        {days.slice(0, 7).map((day) => (
          <span key={day} className="truncate px-1 py-2">
            <span className="sm:hidden">{formatDay(day, { weekday: "narrow" })}</span>
            <span className="hidden sm:inline">{formatDay(day, { weekday: "short" })}</span>
          </span>
        ))}
      </div>
      <ul className="grid grid-cols-7">
        {days.map((day, index) => {
          const tasks = byDay.get(day) ?? [];
          const inMonth = day.slice(0, 7) === month;
          const isToday = day === today;
          const overdue = tasks.some((task) => isOverdue(task, now));
          const label = [
            formatDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
            isToday ? "today" : null,
            tasks.length > 0 ? taskCount(tasks.length) : "no tasks",
            overdue ? "some overdue" : null,
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <li
              key={day}
              className={`min-w-0 border-ink/10 dark:border-white/10 ${index % 7 === 6 ? "" : "border-r"} ${
                index < days.length - 7 ? "border-b" : ""
              } ${inMonth ? "" : "bg-ink/[0.03] dark:bg-black/20"}`}
            >
              {/* On phones the whole cell is this button and opens the day; from sm up the tasks are listed under it. */}
              <button
                type="button"
                onClick={() => openDay(day)}
                aria-label={label}
                aria-current={isToday ? "date" : undefined}
                className={`flex min-h-16 w-full flex-col items-center gap-1 px-0.5 py-1.5 hover:bg-ink/5 dark:hover:bg-white/5 sm:min-h-0 sm:flex-row sm:justify-between sm:px-2 ${focusRing} focus-visible:ring-inset`}
              >
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm ${
                    isToday
                      ? "bg-brand font-bold text-white"
                      : inMonth
                        ? "font-medium text-ink dark:text-slate-100"
                        : "text-muted dark:text-dark-muted"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                {isToday && <span className="hidden text-xs font-semibold text-brand-dark dark:text-slate-50 sm:inline">Today</span>}
                {tasks.length > 0 && (
                  <span
                    aria-hidden="true"
                    className={`inline-flex min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-semibold leading-5 sm:hidden ${
                      overdue
                        ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                        : "bg-brand/10 text-brand-dark dark:bg-brand/25 dark:text-slate-50"
                    }`}
                  >
                    {tasks.length}
                    {overdue && "!"}
                  </span>
                )}
              </button>
              <div className="hidden min-h-[5.5rem] space-y-1 px-1.5 pb-1.5 sm:block">
                {tasks.slice(0, MONTH_CHIPS).map((task) => (
                  <TaskChip key={task.id} task={task} timeZone={timeZone} now={now} />
                ))}
                {tasks.length > MONTH_CHIPS && (
                  <button
                    type="button"
                    onClick={() => openDay(day)}
                    aria-label={`${tasks.length - MONTH_CHIPS} more on ${formatDay(day, { month: "long", day: "numeric" })}, open the day`}
                    className={`min-h-6 w-full rounded-md px-1.5 text-left text-xs font-medium text-brand-dark hover:underline dark:text-slate-50 ${focusRing}`}
                  >
                    +{tasks.length - MONTH_CHIPS} more
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WeekView({ days, byDay, today, timeZone, now, openDay }: ViewProps) {
  return (
    <>
      {/* Seven columns need a wide screen; below xl the same week is a list of days. */}
      <ul className={`${surfaceClass} hidden grid-cols-7 overflow-hidden xl:grid`}>
        {days.map((day, index) => {
          const tasks = byDay.get(day) ?? [];
          const isToday = day === today;

          return (
            <li
              key={day}
              className={`min-w-0 border-ink/10 dark:border-white/10 ${index < 6 ? "border-r" : ""} ${
                isToday ? "bg-brand/[0.04] dark:bg-brand/10" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => openDay(day)}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatDay(day, { weekday: "long", month: "long", day: "numeric" })}${
                  isToday ? ", today" : ""
                }, ${taskCount(tasks.length)}, open the day`}
                className={`flex w-full flex-col items-center gap-0.5 border-b border-ink/10 px-1 py-2 hover:bg-ink/5 dark:border-white/10 dark:hover:bg-white/5 ${focusRing} focus-visible:ring-inset`}
              >
                <span className="text-xs font-medium text-muted dark:text-dark-muted">
                  {formatDay(day, { weekday: "short" })}
                </span>
                <span
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full text-sm ${
                    isToday ? "bg-brand font-bold text-white" : "font-semibold text-ink dark:text-slate-50"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                <span className={`text-[11px] font-semibold ${isToday ? "text-brand-dark dark:text-slate-50" : "invisible"}`}>
                  Today
                </span>
              </button>
              <div className="min-h-[18rem] space-y-1.5 p-1.5">
                {tasks.map((task) => (
                  <TaskCard key={task.id} task={task} timeZone={timeZone} now={now} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className={`${surfaceClass} overflow-hidden xl:hidden`}>
        {days.map((day) => {
          const tasks = byDay.get(day) ?? [];

          return (
            <section key={day} aria-label={formatDay(day, { weekday: "long", month: "long", day: "numeric" })}>
              <DayHeading day={day} today={today} count={tasks.length} />
              {tasks.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted dark:text-dark-muted">Nothing due.</p>
              ) : (
                <ul className="divide-y divide-ink/10 dark:divide-white/10">
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} timeZone={timeZone} now={now} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** The days that have tasks, each under its date. Used for one day and for the agenda. */
function DayList({ days, byDay, today, timeZone, now }: ViewProps) {
  return (
    <div className={`${surfaceClass} overflow-hidden`}>
      {days
        .filter((day) => byDay.has(day))
        .map((day) => (
          <section key={day} aria-label={formatDay(day, { weekday: "long", month: "long", day: "numeric" })}>
            <DayHeading day={day} today={today} count={byDay.get(day)!.length} />
            <ul className="divide-y divide-ink/10 dark:divide-white/10">
              {byDay.get(day)!.map((task) => (
                <TaskRow key={task.id} task={task} timeZone={timeZone} now={now} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

/**
 * The calendar: tasks placed on their due dates, as a month, week, day or
 * agenda. It asks /api/calendar for the visible range only, with the chosen
 * scope and filters; the server decides what this user may see. Days and
 * times are in the account's time zone (Settings), or the browser's.
 */
export default function CalendarView({ userId, projects, teams, teamMembers }: CalendarViewProps) {
  const timeZone = useTimeZone();
  const filtersId = useId();
  const searchParams = useSearchParams();
  const state = useMemo(
    () => readState(new URLSearchParams(searchParams.toString()), projects, teams),
    [searchParams, projects, teams],
  );
  // The clock is only read in the browser; it also moves "today" and overdue along while the page stays open.
  const [now, setNow] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloads, setReloads] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const { view, scope, projectId, assignee, status, priority } = state;
  const today = timeZone && now ? dayKeyOf(now, timeZone) : null;
  const anchor = state.date ?? today;
  const days = useMemo(() => (anchor ? visibleDays(view, anchor) : null), [view, anchor]);
  const range = useMemo(() => (days && timeZone ? rangeOfDays(days, timeZone) : null), [days, timeZone]);
  const start = range?.start.toISOString();
  const end = range?.end.toISOString();

  // Changing the view, day or a filter rewrites the address in place (no new history entry per click).
  const update = (changes: Partial<CalendarState>) => {
    const query = writeState({ ...state, ...changes });

    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  };
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  useEffect(() => {
    if (!start || !end) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ start, end });

    if (scope === "personal") params.set("scope", "personal");
    else if (scope !== "all") {
      params.set("scope", "team");
      if (scope !== "team") params.set("teamId", scope);
    }
    if (projectId) params.set("projectId", projectId);
    if (assignee) params.set("assignee", assignee);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);

    setLoading(true);
    setError("");

    fetch(`/api/calendar?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (Partial<Loaded> & { error?: unknown }) | null;

        if (!response.ok || !payload || !Array.isArray(payload.tasks)) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "We couldn't load your calendar right now. Please try again.",
          );
        }

        setLoaded({ tasks: payload.tasks, truncated: payload.truncated === true });
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;

        setLoaded(null);
        setLoading(false);
        setError(
          reason instanceof TypeError
            ? "Unable to reach the server. Check your connection and try again."
            : reason instanceof Error
              ? reason.message
              : "We couldn't load your calendar right now. Please try again.",
        );
      });

    return () => controller.abort();
  }, [start, end, scope, projectId, assignee, status, priority, reloads]);

  // Each task goes on the day its due instant falls on in this time zone; the API already returns them soonest first.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();

    if (loaded && timeZone && days) {
      const visible = new Set(days);

      for (const task of loaded.tasks) {
        const day = dayKeyOf(new Date(task.dueDate), timeZone);

        if (!visible.has(day)) continue;

        const list = map.get(day);
        if (list) list.push(task);
        else map.set(day, [task]);
      }
    }

    return map;
  }, [loaded, timeZone, days]);

  // The filters only offer what fits the scope; the server applies the same narrowing whatever is sent.
  const scopedProjects = projects.filter((project) =>
    scope === "all"
      ? true
      : scope === "personal"
        ? project.teamId === null
        : scope === "team"
          ? project.teamId !== null
          : project.teamId === scope,
  );
  const people = useMemo(() => {
    const teamIds = scope === "all" || scope === "team" ? teams.map((team) => team.id) : scope === "personal" ? [] : [scope];
    const byId = new Map<string, string>();

    for (const teamId of teamIds) {
      for (const member of teamMembers[teamId] ?? []) {
        if (member.id !== userId) byId.set(member.id, member.name);
      }
    }

    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [scope, teams, teamMembers, userId]);
  const activeFilters = [scope !== "all", projectId, assignee, status, priority].filter(Boolean).length;

  function changeScope(next: string) {
    const fits = (teamId: string | null) =>
      next === "all" || (next === "personal" ? teamId === null : next === "team" ? teamId !== null : teamId === next);
    const project = projects.find(({ id }) => id === projectId);

    // A project or person outside the new scope would only ever match nothing.
    update({
      scope: next,
      projectId: project && fits(project.teamId) ? projectId : "",
      assignee: next === "personal" || (assignee !== "me" && assignee !== "unassigned") ? "" : assignee,
    });
  }

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <PageIntro title="Calendar" description="See what is due and when, across the projects you can access." />
      <CreateTaskButton
        projects={projects}
        // In the day view a new task is offered that day as its due date.
        defaultDueDate={view === "day" ? (anchor ?? undefined) : undefined}
        onSaved={reload}
        className={createButtonClass}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        New task
      </CreateTaskButton>
    </div>
  );

  // Until the browser's clock and time zone are known there is no "today" to draw around.
  if (!timeZone || !now || !today || !anchor || !days) {
    return (
      <div className="space-y-6">
        {header}
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading calendar…</span>
          <div aria-hidden="true" className="h-[28rem] rounded-xl bg-ink/5 motion-safe:animate-pulse dark:bg-white/5" />
        </div>
      </div>
    );
  }

  const shown = [...byDay.values()].reduce((sum, tasks) => sum + tasks.length, 0);
  const title = formatRangeTitle(view, anchor);
  const period = view === "agenda" ? `${days.length} days` : view;
  const viewProps: ViewProps = {
    days,
    byDay,
    today,
    timeZone,
    now,
    openDay: (day) => update({ view: "day", date: day }),
  };

  return (
    <div className="space-y-6">
      {header}

      <section aria-label="Calendar" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" onClick={() => update({ date: null })} className={outlineButtonClass}>
              Today
            </button>
            <button
              type="button"
              onClick={() => update({ date: shiftAnchor(view, anchor, -1) })}
              aria-label={`Previous ${period}`}
              className={iconButtonClass}
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => update({ date: shiftAnchor(view, anchor, 1) })}
              aria-label={`Next ${period}`}
              className={iconButtonClass}
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <h2
              aria-live="polite"
              className="w-full min-w-0 break-words font-display text-lg font-semibold text-ink dark:text-slate-50 sm:ml-2 sm:w-auto sm:text-xl"
            >
              {title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Calendar view"
              className="flex w-fit max-w-full gap-1 rounded-full bg-ink/5 p-1 dark:bg-white/5"
            >
              {CALENDAR_VIEWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  onClick={() => update({ view: option })}
                  className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${focusRing} ${
                    view === option
                      ? "bg-brand text-white shadow-sm"
                      : "text-muted hover:text-ink dark:text-dark-muted dark:hover:text-slate-50"
                  }`}
                >
                  {calendarViewLabels[option]}
                </button>
              ))}
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
        </div>

        {/* Always shown from lg up; behind the Filters button on smaller screens. */}
        <div
          id={filtersId}
          role="group"
          aria-label="Filter the calendar"
          className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] xl:items-end`}
        >
          <FilterSelect label="Showing" value={scope} onChange={changeScope}>
            <option value="all">All my work</option>
            <option value="personal">Personal projects</option>
            {teams.length > 0 && <option value="team">{teams.length === 1 ? "Team projects" : "All team projects"}</option>}
            {teams.length > 1 &&
              teams.map((team) => (
                <option key={team.id} value={team.id}>
                  Team: {team.name}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect label="Project" value={projectId} onChange={(value) => update({ projectId: value })}>
            <option value="">All projects</option>
            {scopedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </FilterSelect>
          {/* Personal tasks have no assignee, so there is nobody to filter by in that scope. */}
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
            {/* A person restored from the address who isn't in the list any more still shows as the choice. */}
            {assignee && !["me", "unassigned"].includes(assignee) && !people.some(({ id }) => id === assignee) && (
              <option value={assignee}>Someone else</option>
            )}
          </FilterSelect>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => update({ status: value as TaskStatusValue | "" })}
          >
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
              onClick={() => update({ scope: "all", projectId: "", assignee: "", status: "", priority: "" })}
              className={outlineButtonClass}
            >
              Clear filters
            </button>
          )}
        </div>

        <p role="status" className="text-sm text-muted dark:text-dark-muted">
          {loading
            ? "Loading tasks…"
            : error
              ? ""
              : `${shown === 0 ? "No tasks" : taskCount(shown)} due · times in ${timeZone.replaceAll("_", " ")}`}
        </p>

        {error ? (
          <div role="alert" className={`${surfaceClass} px-6 py-10 text-center`}>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">
              <CircleAlert aria-hidden="true" className="h-6 w-6" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold text-ink dark:text-slate-50">
              The calendar couldn&apos;t be loaded
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted dark:text-dark-muted">{error}</p>
            <button type="button" onClick={reload} className={`${outlineButtonClass} mt-5`}>
              <RotateCw aria-hidden="true" className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <div aria-hidden="true" className="h-[28rem] rounded-xl bg-ink/5 motion-safe:animate-pulse dark:bg-white/5" />
        ) : (
          <div aria-busy={loading} className={loading ? "opacity-60" : undefined}>
            {loaded.truncated && (
              <p className="mb-3 rounded-lg border border-ink/10 bg-paper px-4 py-3 text-sm text-muted dark:border-white/10 dark:bg-dark-background dark:text-dark-muted">
                There are more tasks in this period than the calendar shows at once. Narrow the filters or choose a
                shorter view to see the rest.
              </p>
            )}

            {view === "month" && <MonthView {...viewProps} month={anchor.slice(0, 7)} />}
            {view === "week" && <WeekView {...viewProps} />}
            {(view === "day" || view === "agenda") &&
              (shown > 0 ? (
                <DayList {...viewProps} />
              ) : (
                !loading && (
                  <div className={surfaceClass}>
                    <EmptyState
                      icon={view === "day" ? CalendarX : CalendarDays}
                      title={view === "day" ? "Nothing due this day" : "Nothing due in this period"}
                      description={
                        activeFilters > 0
                          ? "No tasks with a due date match these filters here. Tasks without a due date aren't shown on the calendar."
                          : "Tasks appear here once they have a due date. Add one when you create or edit a task."
                      }
                    />
                  </div>
                )
              ))}

            {(view === "month" || view === "week") && shown === 0 && !loading && (
              <p className="mt-3 text-sm text-muted dark:text-dark-muted">
                {activeFilters > 0
                  ? "No tasks with a due date match these filters in this period."
                  : "No tasks are due in this period. Tasks appear here once they have a due date."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
