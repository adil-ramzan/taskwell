import "server-only";

import type { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { movedToCompleted, tallyStatusAndPriority } from "@/lib/analytics";
import { avatarSelect, DELETED_USER, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { dayKeyOf, isValidTimeZone } from "@/lib/calendar-dates";
import { prisma } from "@/lib/prisma";
import { csvDateTime, csvDueDate, toCsv } from "@/lib/report-csv";
import {
  bucketIndexer,
  customRangeProblem,
  DEFAULT_REPORT_RANGE,
  REPORT_EXPORT_LIMIT,
  REPORT_LISTS,
  REPORT_MAX_PAGE,
  REPORT_PAGE_SIZE,
  REPORT_RANGES,
  resolveReportRange,
  trendBuckets,
  type ReportList,
  type ReportRange,
  type ReportRangePreset,
  type TrendBucket,
  type TrendUnit,
} from "@/lib/report-dates";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import { getTeamMembership } from "@/lib/teams";
import { formatHoursMinutes } from "@/lib/time-rules";
import { trackedSecondsByTask, trackedSecondsTotal } from "@/lib/time-tracking";

/*
 * Reports. Every number is counted from the database when it is asked for;
 * nothing is stored. As everywhere else, access comes from the task's project
 * (lib/access.ts) for the user ID taken from the session, and the scope and
 * filters are ANDed with that rule, so they can only narrow what the user may
 * already see.
 *
 * Two different things are selected:
 *  - the filters (scope, team, project, assignee, status, priority) choose the
 *    tasks a report is about, as they are now;
 *  - the date range chooses which of their dates count: created, completed,
 *    due and activity in the range are four separate questions.
 *
 * A task has no completion column. It is "completed at" its latest recorded
 * change to Completed (an Activity row, written since Phase 9) while its
 * status still is Completed, the same rule the dashboard chart uses.
 */

/** The most people the assignee breakdown names and projects the project breakdown lists; the rest are summed. */
export const REPORT_ASSIGNEE_LIMIT = 20;
export const REPORT_PROJECT_LIMIT = 50;
/** The most rows read per series to draw the trend; beyond it the trend is left out rather than drawn partly. */
export const REPORT_TREND_ROW_LIMIT = 10_000;

const MAX_ID_LENGTH = 100;
const EXPORT_CHUNK = 1000;

export type ReportFilters = {
  /** "team" is every team the user is in, or one of them when teamId is set. */
  scope: "all" | "personal" | "team";
  teamId?: string;
  projectId?: string;
  /** "me", "unassigned" or a user ID. */
  assignee?: string;
  status?: TaskStatusValue;
  priority?: TaskPriorityValue;
};

/** A checked request: who may see what was already decided, and the range is in instants. */
export type ReportQuery = ReportFilters & {
  range: ReportRange;
  timeZone: string;
  /** Where the zone came from: the account's setting, the `tz` parameter (the browser's zone), or neither. */
  timeZoneSource: "account" | "request" | "utc";
  now: Date;
};

/** 400: the request is malformed. 404: it names a team, project or person this user has no access to. */
export type ReportProblem = { error: string; status: 400 | 404 };

const bad = (error: string): ReportProblem => ({ error, status: 400 });
const notFound = (error: string): ReportProblem => ({ error, status: 404 });
const oneOf = <T extends string>(values: readonly T[], value: string): value is T => values.includes(value as T);

/**
 * Reads the query string, then checks it against the session user: the
 * account's time zone, and that a named team, project or person is one they
 * can reach. The answer for an ID that doesn't exist and for one that isn't
 * theirs is the same, so IDs can't be probed.
 */
export async function loadReportQuery(
  userId: string,
  params: URLSearchParams,
  now = new Date(),
): Promise<{ data: ReportQuery } | ReportProblem> {
  const preset = params.get("range") ?? DEFAULT_REPORT_RANGE;
  const custom = { from: params.get("from"), to: params.get("to") };
  const tz = params.get("tz");
  const scope = params.get("scope") ?? "all";
  const teamId = params.get("teamId");
  const projectId = params.get("projectId");
  const assignee = params.get("assignee");
  const status = params.get("status");
  const priority = params.get("priority");

  if (!oneOf(REPORT_RANGES, preset)) {
    return bad(`Range must be one of ${REPORT_RANGES.join(", ")}.`);
  }

  if (preset === "custom") {
    const problem = customRangeProblem(custom.from, custom.to);
    if (problem) return bad(problem);
  } else if (custom.from || custom.to) {
    return bad("Start and end dates are only used with a custom range.");
  }

  if (tz !== null && (tz.length > MAX_ID_LENGTH || !isValidTimeZone(tz))) {
    return bad("Choose a valid time zone.");
  }

  if (!oneOf(["all", "personal", "team"] as const, scope)) {
    return bad("Scope must be all, personal or team.");
  }

  if (teamId && (scope !== "team" || teamId.length > MAX_ID_LENGTH)) {
    return bad("Choose a valid team.");
  }

  if (projectId && projectId.length > MAX_ID_LENGTH) return bad("Choose a valid project.");
  if (assignee && assignee.length > MAX_ID_LENGTH) return bad("Choose a valid assignee.");

  const filters: ReportFilters = { scope };

  if (teamId) filters.teamId = teamId;
  if (projectId) filters.projectId = projectId;
  if (assignee) filters.assignee = assignee;

  if (status) {
    if (!oneOf(TASK_STATUSES, status)) return bad("Choose a valid status.");
    filters.status = status;
  }

  if (priority) {
    if (!oneOf(TASK_PRIORITIES, priority)) return bad("Choose a valid priority.");
    filters.priority = priority;
  }

  // "me" and the user's own ID are the same person, and need no lookup.
  const person = assignee && assignee !== "me" && assignee !== "unassigned" && assignee !== userId ? assignee : null;

  const [account, membership, project, colleague] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }),
    teamId ? getTeamMembership(userId, teamId) : null,
    projectId
      ? prisma.project.findFirst({ where: { AND: [{ id: projectId }, projectAccessWhere(userId)] }, select: { id: true } })
      : null,
    // Someone who shares at least one team with the user.
    person
      ? prisma.teamMember.findFirst({
          where: { userId: person, team: { memberships: { some: { userId } } } },
          select: { id: true },
        })
      : null,
  ]);

  if (teamId && !membership) return notFound("That team doesn't exist or you aren't a member of it.");
  if (projectId && !project) return notFound("That project doesn't exist or you don't have access to it.");
  if (person && !colleague) return notFound("That person isn't in any of your teams.");

  // The saved preference always wins; `tz` only stands in when there is none.
  const saved = account?.timeZone && isValidTimeZone(account.timeZone) ? account.timeZone : null;
  const timeZone = saved ?? tz ?? "UTC";
  const range = resolveReportRange(preset, custom, timeZone, now);

  if ("error" in range) return bad(range.error);

  return {
    data: {
      ...filters,
      range: range.data,
      timeZone,
      timeZoneSource: saved ? "account" : tz ? "request" : "utc",
      now,
    },
  };
}

/** The `list` parameter of the task table and the export; "all" when absent. */
export function parseReportList(params: URLSearchParams): { data: ReportList } | ReportProblem {
  const list = params.get("list") ?? "all";

  return oneOf(REPORT_LISTS, list) ? { data: list } : bad(`List must be one of ${REPORT_LISTS.join(", ")}.`);
}

/** The `page` parameter of the task table; 1 when absent. */
export function parseReportPage(params: URLSearchParams): { data: number } | ReportProblem {
  const value = params.get("page") ?? "1";
  const page = /^\d{1,4}$/.test(value) ? Number(value) : 0;

  return page >= 1 && page <= REPORT_MAX_PAGE
    ? { data: page }
    : bad(`Page must be a number from 1 to ${REPORT_MAX_PAGE}.`);
}

/* --------------------------------- Filters -------------------------------- */

/** The accessible projects a report covers. The access rule is always part of it. */
function projectWhere(userId: string, filters: ReportFilters): Prisma.ProjectWhereInput {
  const scope: Prisma.ProjectWhereInput =
    filters.scope === "personal"
      ? { teamId: null }
      : filters.scope === "team"
        ? { teamId: filters.teamId ?? { not: null } }
        : {};

  return { AND: [projectAccessWhere(userId), scope, ...(filters.projectId ? [{ id: filters.projectId }] : [])] };
}

/** The tasks a report is about: accessible, in scope, and matching every filter. */
function taskWhere(userId: string, filters: ReportFilters): Prisma.TaskWhereInput {
  const assigneeId =
    filters.assignee === undefined
      ? undefined
      : filters.assignee === "me"
        ? userId
        : filters.assignee === "unassigned"
          ? null
          : filters.assignee;

  return {
    project: projectWhere(userId, filters),
    ...(assigneeId !== undefined ? { assigneeId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };
}

const createdIn = ({ start, end }: ReportRange): Prisma.TaskWhereInput => ({ createdAt: { gte: start, lt: end } });
const dueIn = ({ start, end }: ReportRange): Prisma.TaskWhereInput => ({ dueDate: { gte: start, lt: end } });

/** Completed now, and the latest recorded change to Completed is in the range: one in it, none after it. */
const completedIn = ({ start, end }: ReportRange): Prisma.TaskWhereInput => ({
  status: "COMPLETED",
  activities: {
    some: { ...movedToCompleted, createdAt: { gte: start, lt: end } },
    none: { ...movedToCompleted, createdAt: { gte: end } },
  },
});

/**
 * What the completion rate is measured against: tasks that were open at some
 * point in the range. That is, created before it ended and either still not
 * completed, or completed in or after it. A completed task without a recorded
 * completion can't be placed, so it is left out.
 */
const openDuring = ({ start, end }: ReportRange): Prisma.TaskWhereInput => ({
  createdAt: { lt: end },
  OR: [
    { status: { not: "COMPLETED" } },
    { status: "COMPLETED", activities: { some: { ...movedToCompleted, createdAt: { gte: start } } } },
  ],
});

const listWhere = (list: ReportList, range: ReportRange): Prisma.TaskWhereInput =>
  list === "created" ? createdIn(range) : list === "completed" ? completedIn(range) : list === "due" ? dueIn(range) : {};

/* --------------------------------- Report --------------------------------- */

export type AssigneeStat = {
  /** Null for the "Unassigned" row. */
  id: string | null;
  name: string;
  email: string;
  avatar: AvatarRef | null;
  total: number;
  open: number;
  completed: number;
};

export type ProjectReportRow = {
  id: string;
  name: string;
  /** Null for a personal project. */
  team: string | null;
  total: number;
  completed: number;
  open: number;
  overdue: number;
};

export type TrendPoint = TrendBucket & { created: number; completed: number; activity: number };

export type Report = {
  generatedAt: string;
  timeZone: string;
  timeZoneSource: ReportQuery["timeZoneSource"];
  /** `start` and `end` are the ISO instants of the half-open range [start, end). */
  range: { preset: ReportRangePreset; from: string; to: string; days: number; start: string; end: string };
  /** What the user can access with no filter at all. Only looked up when nothing matched, to say why. */
  workspace: { projects: number; tasks: number } | null;
  summary: {
    /** Tasks matching the filters, whatever their dates. */
    total: number;
    open: number;
    /** Open, with a due date before `generatedAt`. */
    overdue: number;
    created: number;
    completed: number;
    due: number;
    /** History entries recorded in the range on matching tasks. */
    activity: number;
    /**
     * Seconds of finished time entries on matching tasks that fall inside the range. An entry that
     * crosses the range's start or end counts only for the part inside. Running timers are not counted.
     */
    trackedSeconds: number;
    /** `completed` out of the tasks that were open at some point in the range. No rate when `eligible` is 0. */
    completionRate: { completed: number; eligible: number };
    /** Mean time from creation to completion of the tasks completed in the range; null when there are none. */
    averageCompletionMs: number | null;
    /** Completed tasks with no recorded completion date, which no date-based figure can include. */
    undatedCompleted: number;
  };
  statusCounts: Record<TaskStatusValue, number>;
  priorityCounts: Record<TaskPriorityValue, number>;
  assignees: {
    /** Most tasks first, at most REPORT_ASSIGNEE_LIMIT people, then "Unassigned" if any. */
    rows: AssigneeStat[];
    /** People beyond the limit, and their tasks together. */
    morePeople: number;
    moreTasks: number;
    /** Tasks in team projects (the only ones that can be assigned) and in personal projects. */
    teamTasks: number;
    personalTasks: number;
  };
  projects: {
    /** Projects with at least one matching task, most tasks first, at most REPORT_PROJECT_LIMIT. */
    rows: ProjectReportRow[];
    matching: number;
    /** Accessible projects in the chosen scope, with or without matching tasks. */
    inScope: number;
  };
  /** Null when the range holds too many rows to chart (REPORT_TREND_ROW_LIMIT). */
  trend: { unit: TrendUnit; points: TrendPoint[] } | null;
};

export async function getReport(userId: string, query: ReportQuery): Promise<Report> {
  const { range, timeZone, now } = query;
  const base = taskWhere(userId, query);
  const and = (...extra: Prisma.TaskWhereInput[]): Prisma.TaskWhereInput => ({ AND: [base, ...extra] });
  const inRange = { gte: range.start, lt: range.end };
  const sample = REPORT_TREND_ROW_LIMIT + 1;

  const [
    groups,
    projectGroups,
    overdueGroups,
    assigneeGroups,
    projects,
    created,
    due,
    completed,
    eligible,
    undatedCompleted,
    activity,
    createdTimes,
    completions,
    activityTimes,
    trackedSeconds,
  ] = await Promise.all([
    // Status and priority distributions, the total and the open count from one grouped query (at most 12 rows).
    prisma.task.groupBy({ by: ["status", "priority"], where: base, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["projectId", "status"], where: base, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: and({ dueDate: { lt: now }, status: { not: "COMPLETED" } }),
      _count: { _all: true },
    }),
    // Only team projects' tasks can have an assignee.
    prisma.task.groupBy({
      by: ["assigneeId", "status"],
      where: and({ project: { teamId: { not: null } } }),
      _count: { _all: true },
    }),
    prisma.project.findMany({
      where: projectWhere(userId, query),
      select: { id: true, name: true, team: { select: { name: true } } },
    }),
    prisma.task.count({ where: and(createdIn(range)) }),
    prisma.task.count({ where: and(dueIn(range)) }),
    prisma.task.count({ where: and(completedIn(range)) }),
    prisma.task.count({ where: and(openDuring(range)) }),
    prisma.task.count({ where: and({ status: "COMPLETED", activities: { none: movedToCompleted } }) }),
    prisma.activity.count({ where: { createdAt: inRange, task: base } }),
    // The trend's three series: one timestamp per row, bucketed below in the report's time zone.
    prisma.task.findMany({ where: and(createdIn(range)), select: { createdAt: true }, take: sample }),
    // Newest first, so the first row of a task is its latest completion (it may fall after the range).
    prisma.activity.findMany({
      where: { ...movedToCompleted, createdAt: { gte: range.start }, task: and({ status: "COMPLETED" }) },
      select: { taskId: true, createdAt: true, task: { select: { createdAt: true } } },
      orderBy: { createdAt: "desc" },
      take: sample,
    }),
    prisma.activity.findMany({ where: { createdAt: inRange, task: base }, select: { createdAt: true }, take: sample }),
    trackedSecondsTotal(base, range),
  ]);

  const { statusCounts, priorityCounts } = tallyStatusAndPriority(groups);
  const total = TASK_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0);

  /* Projects */
  const perProject = new Map<string, { total: number; completed: number; overdue: number }>();
  const projectStat = (id: string) => {
    let stat = perProject.get(id);

    if (!stat) {
      stat = { total: 0, completed: 0, overdue: 0 };
      perProject.set(id, stat);
    }

    return stat;
  };

  for (const group of projectGroups) {
    const stat = projectStat(group.projectId);

    stat.total += group._count._all;
    if (group.status === "COMPLETED") stat.completed += group._count._all;
  }

  let overdue = 0;

  for (const group of overdueGroups) {
    projectStat(group.projectId).overdue = group._count._all;
    overdue += group._count._all;
  }

  const projectRows = projects
    .flatMap((project) => {
      const stat = perProject.get(project.id);

      return stat
        ? [{ id: project.id, name: project.name, team: project.team?.name ?? null, ...stat, open: stat.total - stat.completed }]
        : [];
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  /* Assignees */
  const perAssignee = new Map<string | null, { total: number; completed: number }>();

  for (const group of assigneeGroups) {
    const stat = perAssignee.get(group.assigneeId) ?? { total: 0, completed: 0 };

    stat.total += group._count._all;
    if (group.status === "COMPLETED") stat.completed += group._count._all;
    perAssignee.set(group.assigneeId, stat);
  }

  const teamTasks = [...perAssignee.values()].reduce((sum, stat) => sum + stat.total, 0);
  const people = [...perAssignee]
    .flatMap(([id, stat]) => (id === null ? [] : [{ id, ...stat }]))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  const named = people.slice(0, REPORT_ASSIGNEE_LIMIT);
  const rest = people.slice(REPORT_ASSIGNEE_LIMIT);
  const unassigned = perAssignee.get(null);

  // Second round: names for the people listed, and (only when nothing matched) what exists without filters.
  const [users, workspace] = await Promise.all([
    named.length > 0
      ? prisma.user.findMany({
          where: { id: { in: named.map((person) => person.id) } },
          select: { id: true, name: true, email: true, ...avatarSelect },
        })
      : [],
    total === 0
      ? Promise.all([
          prisma.project.count({ where: projectAccessWhere(userId) }),
          prisma.task.count({ where: { project: projectAccessWhere(userId) } }),
        ]).then(([projectCount, taskCount]) => ({ projects: projectCount, tasks: taskCount }))
      : null,
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const assigneeRows: AssigneeStat[] = named.map(({ id, total: count, completed: done }) => {
    // Deleting an account unassigns its tasks, so a miss here is only a race with that.
    const user = usersById.get(id);

    return {
      id,
      name: user?.name ?? DELETED_USER,
      email: user?.email ?? "",
      avatar: toAvatarRef(user),
      total: count,
      completed: done,
      open: count - done,
    };
  });

  if (unassigned) {
    assigneeRows.push({
      id: null,
      name: "Unassigned",
      email: "",
      avatar: null,
      total: unassigned.total,
      completed: unassigned.completed,
      open: unassigned.total - unassigned.completed,
    });
  }

  /* Completions in the range, and the trend */
  const latestCompletion = new Map<string, { at: Date; createdAt: Date }>();

  for (const row of completions.slice(0, REPORT_TREND_ROW_LIMIT)) {
    if (!latestCompletion.has(row.taskId)) latestCompletion.set(row.taskId, { at: row.createdAt, createdAt: row.task.createdAt });
  }

  const completedInRange = [...latestCompletion.values()].filter(({ at }) => at < range.end);
  const complete = [createdTimes, completions, activityTimes].every((rows) => rows.length <= REPORT_TREND_ROW_LIMIT);
  let trend: Report["trend"] = null;

  if (complete) {
    const { unit, buckets } = trendBuckets(range.from, range.to);
    const indexOf = bucketIndexer(buckets);
    const points: TrendPoint[] = buckets.map((bucket) => ({ ...bucket, created: 0, completed: 0, activity: 0 }));
    const add = (instant: Date, series: "created" | "completed" | "activity") => {
      const index = indexOf(dayKeyOf(instant, timeZone));
      if (index >= 0) points[index][series] += 1;
    };

    createdTimes.forEach(({ createdAt }) => add(createdAt, "created"));
    completedInRange.forEach(({ at }) => add(at, "completed"));
    activityTimes.forEach(({ createdAt }) => add(createdAt, "activity"));
    trend = { unit, points };
  }

  return {
    generatedAt: now.toISOString(),
    timeZone,
    timeZoneSource: query.timeZoneSource,
    range: {
      preset: range.preset,
      from: range.from,
      to: range.to,
      days: range.days,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    workspace,
    summary: {
      total,
      open: total - statusCounts.COMPLETED,
      overdue,
      created,
      completed,
      due,
      activity,
      trackedSeconds,
      completionRate: { completed, eligible },
      averageCompletionMs:
        complete && completedInRange.length > 0
          ? Math.round(
              completedInRange.reduce((sum, { at, createdAt }) => sum + Math.max(0, at.getTime() - createdAt.getTime()), 0) /
                completedInRange.length,
            )
          : null,
      undatedCompleted,
    },
    statusCounts,
    priorityCounts,
    assignees: {
      rows: assigneeRows,
      morePeople: rest.length,
      moreTasks: rest.reduce((sum, person) => sum + person.total, 0),
      teamTasks,
      personalTasks: total - teamTasks,
    },
    projects: {
      rows: projectRows.slice(0, REPORT_PROJECT_LIMIT),
      matching: projectRows.length,
      inScope: projects.length,
    },
    trend,
  };
}

/* -------------------------------- Task list ------------------------------- */

/** One row of the task table. No description, comments or people's IDs. */
export type ReportTask = {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** ISO instants. `completedAt` is null for an open task and for a completed one with no recorded completion. */
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  project: { id: string; name: string; team: string | null };
  assignee: { name: string; email: string; avatar: AvatarRef | null } | null;
  /** The parent's title when this row is a subtask. A subtask is a task: it is counted once, like any other. */
  parent: { id: string; title: string } | null;
  /** Part of a repeating series: it repeats now, or was created as the next occurrence of a task that did. */
  recurring: boolean;
  /** Seconds tracked on this task inside the report's range (see `summary.trackedSeconds`). A subtask's time is its own. */
  trackedSeconds: number;
};

export type ReportTaskPage = {
  list: ReportList;
  tasks: ReportTask[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Newest first, except tasks due in the range, which read soonest first. Completed ones go by their last change. */
const listOrder = (list: ReportList): Prisma.TaskOrderByWithRelationInput[] =>
  list === "due"
    ? [{ dueDate: "asc" }, { id: "asc" }]
    : list === "completed"
      ? [{ updatedAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

/** When each of these tasks was last moved to Completed. One grouped query for the whole page. */
async function completionDates(tasks: { id: string; status: TaskStatusValue }[]) {
  const ids = tasks.filter((task) => task.status === "COMPLETED").map((task) => task.id);
  const rows =
    ids.length > 0
      ? await prisma.activity.groupBy({
          by: ["taskId"],
          where: { ...movedToCompleted, taskId: { in: ids } },
          _max: { createdAt: true },
        })
      : [];

  return new Map(rows.map((row) => [row.taskId, row._max.createdAt]));
}

export async function listReportTasks(
  userId: string,
  query: ReportQuery,
  list: ReportList,
  page: number,
): Promise<ReportTaskPage> {
  const where: Prisma.TaskWhereInput = { AND: [taskWhere(userId, query), listWhere(list, query.range)] };
  const [total, rows] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        project: { select: { id: true, name: true, team: { select: { name: true } } } },
        assignee: { select: { name: true, email: true, ...avatarSelect } },
        parentTask: { select: { id: true, title: true } },
        recurredFromId: true,
        recurrence: { select: { active: true } },
      },
      orderBy: listOrder(list),
      skip: (page - 1) * REPORT_PAGE_SIZE,
      take: REPORT_PAGE_SIZE,
    }),
  ]);
  const [completedAt, tracked] = await Promise.all([
    completionDates(rows),
    // One lookup for the page: no query per task.
    trackedSecondsByTask({ id: { in: rows.map((task) => task.id) } }, query.range),
  ]);

  return {
    list,
    total,
    page,
    pageSize: REPORT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE)),
    tasks: rows.map(({ assignee, project, parentTask, recurredFromId, recurrence, ...task }) => ({
      ...task,
      dueDate: task.dueDate?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      completedAt: completedAt.get(task.id)?.toISOString() ?? null,
      project: { id: project.id, name: project.name, team: project.team?.name ?? null },
      assignee: assignee ? { name: assignee.name, email: assignee.email, avatar: toAvatarRef(assignee) } : null,
      parent: parentTask,
      recurring: recurrence?.active === true || recurredFromId !== null,
      trackedSeconds: tracked.get(task.id) ?? 0,
    })),
  };
}

/* --------------------------------- Export --------------------------------- */

/**
 * The same tasks as the task table (same filters, same `list`), all pages, as
 * CSV with dates on the report's time zone clock. A selection larger than
 * REPORT_EXPORT_LIMIT is refused, so a file is never silently incomplete.
 */
export async function exportReportCsv(
  userId: string,
  query: ReportQuery,
  list: ReportList,
): Promise<{ csv: string; rows: number } | { tooMany: number }> {
  const where: Prisma.TaskWhereInput = { AND: [taskWhere(userId, query), listWhere(list, query.range)] };
  const total = await prisma.task.count({ where });

  if (total > REPORT_EXPORT_LIMIT) {
    return { tooMany: total };
  }

  const { timeZone } = query;
  const lines: string[][] = [];

  // A few bounded reads, each with one grouped lookup of completion dates: no query per task.
  for (let skip = 0; skip < total && skip < REPORT_EXPORT_LIMIT; skip += EXPORT_CHUNK) {
    const rows = await prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        project: { select: { name: true, team: { select: { name: true } } } },
        assignee: { select: { name: true } },
        parentTask: { select: { title: true } },
        recurredFromId: true,
        recurrence: { select: { active: true } },
      },
      orderBy: listOrder(list),
      skip,
      take: Math.min(EXPORT_CHUNK, REPORT_EXPORT_LIMIT - skip),
    });
    const [completedAt, tracked] = await Promise.all([
      completionDates(rows),
      trackedSecondsByTask({ id: { in: rows.map((task) => task.id) } }, query.range),
    ]);

    for (const task of rows) {
      const completed = completedAt.get(task.id);

      lines.push([
        task.id,
        task.title,
        task.project.name,
        task.project.team?.name ?? "",
        taskStatusLabels[task.status],
        taskPriorityLabels[task.priority],
        // A personal project's tasks can't be assigned, so that cell stays empty.
        task.assignee?.name ?? (task.project.team ? "Unassigned" : ""),
        task.dueDate ? csvDueDate(task.dueDate, timeZone) : "",
        csvDateTime(task.createdAt, timeZone),
        completed ? csvDateTime(completed, timeZone) : "",
        timeZone,
        // Empty for a top-level task.
        task.parentTask?.title ?? "",
        // The same rule as the table's "Repeating task" line.
        task.recurrence?.active === true || task.recurredFromId !== null ? "Yes" : "No",
        // Hours:minutes tracked inside the report's range, like the table's column.
        formatHoursMinutes(tracked.get(task.id) ?? 0),
      ]);
    }

    if (rows.length === 0) break;
  }

  return { csv: toCsv(lines), rows: lines.length };
}
