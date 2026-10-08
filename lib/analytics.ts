import "server-only";

import type { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";

/*
 * Dashboard analytics. Every number comes from grouped or counted database
 * queries over the projects the session user can access (lib/access.ts); a
 * scope only ever narrows that set, so it can't add anything to it. Nothing
 * here is stored: there is no analytics table.
 */

export const ANALYTICS_MONTHS = 6;
export const REVIEW_LIST_SIZE = 5;
export const PROJECT_STATS_SIZE = 6;

/** "all", "personal", or the ID of a team the user belongs to. */
export type AnalyticsScope = "all" | "personal" | { teamId: string };

/**
 * Turns the `scope` query parameter into a scope the user is allowed to see.
 * A team ID that isn't one of `teamIds` (the user's own memberships, loaded on
 * the server) is ignored and treated as "all".
 */
export function resolveAnalyticsScope(value: string | undefined, teamIds: string[]): AnalyticsScope {
  if (value === "personal") return "personal";

  return value && teamIds.includes(value) ? { teamId: value } : "all";
}

/** The accessible projects in a scope. The access rule is always part of it. */
function scopedProjects(userId: string, scope: AnalyticsScope): Prisma.ProjectWhereInput {
  const access = projectAccessWhere(userId);

  if (scope === "all") return access;

  return { AND: [access, { teamId: scope === "personal" ? null : scope.teamId }] };
}

export type MonthlyActivity = {
  /** UTC month, "2026-05". */
  key: string;
  /** "May", or "May 2026" for screen readers and tooltips in `longLabel`. */
  label: string;
  longLabel: string;
  created: number;
  completed: number;
};

export type ProjectStat = {
  id: string;
  name: string;
  /** Null for a personal project. */
  team: string | null;
  total: number;
  completed: number;
};

export type ReviewTask = {
  id: string;
  title: string;
  priority: TaskPriorityValue;
  updatedAt: string;
  project: { id: string; name: string };
  assignee: { name: string; email: string; avatar: AvatarRef | null } | null;
};

export type DashboardAnalytics = {
  statusCounts: Record<TaskStatusValue, number>;
  priorityCounts: Record<TaskPriorityValue, number>;
  /** Oldest first; always ANALYTICS_MONTHS entries, the last being the current UTC month. */
  months: MonthlyActivity[];
  /** Completed tasks with no recorded change to Completed, which therefore can't be placed in a month. */
  undatedCompleted: number;
  /** The projects with the most tasks, up to PROJECT_STATS_SIZE. */
  projects: ProjectStat[];
  projectCount: number;
  /** The most recently updated tasks in review, up to REVIEW_LIST_SIZE. */
  reviewTasks: ReviewTask[];
};

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthLongLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** The last ANALYTICS_MONTHS calendar months in UTC, oldest first, each with its start and end instant. */
function monthRanges(now: Date) {
  return Array.from({ length: ANALYTICS_MONTHS }, (_, index) => {
    const offset = index - (ANALYTICS_MONTHS - 1);
    // Date.UTC normalises a month below 0 into the previous year.
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));

    return { start, end, key: start.toISOString().slice(0, 7) };
  });
}

// An activity that records a task's status changing to Completed (written since Phase 9).
// Also what the reports (lib/reports.ts) date a completion by.
export const movedToCompleted = {
  type: "TASK_STATUS_CHANGED",
  metadata: { path: ["to"], equals: "COMPLETED" },
} satisfies Prisma.ActivityWhereInput;

/** Status and priority totals from one `groupBy(["status", "priority"])`; every value is present, 0 when unused. */
export function tallyStatusAndPriority(
  groups: { status: TaskStatusValue; priority: TaskPriorityValue; _count: { _all: number } }[],
) {
  const statusCounts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatusValue, number>;
  const priorityCounts = Object.fromEntries(TASK_PRIORITIES.map((priority) => [priority, 0])) as Record<
    TaskPriorityValue,
    number
  >;

  for (const group of groups) {
    statusCounts[group.status] += group._count._all;
    priorityCounts[group.priority] += group._count._all;
  }

  return { statusCounts, priorityCounts };
}

export async function getDashboardAnalytics(
  userId: string,
  scope: AnalyticsScope,
  now = new Date(),
): Promise<DashboardAnalytics> {
  const project = scopedProjects(userId, scope);
  const ranges = monthRanges(now);
  const since = ranges[0].start;

  const [groups, createdPerMonth, completions, undatedCompleted, projectGroups, projects, reviewTasks] =
    await Promise.all([
      // Status and priority distributions from one grouped query (at most 12 rows).
      prisma.task.groupBy({ by: ["status", "priority"], where: { project }, _count: { _all: true } }),
      // Created: one count per month. Only tasks that still exist can be counted.
      Promise.all(
        ranges.map(({ start, end }) => prisma.task.count({ where: { project, createdAt: { gte: start, lt: end } } })),
      ),
      // Completed: tasks that are completed now, dated by their latest recorded
      // change to Completed. Bounded to the charted months; one row per task.
      prisma.activity.groupBy({
        by: ["taskId"],
        where: { ...movedToCompleted, createdAt: { gte: since }, task: { status: "COMPLETED", project } },
        _max: { createdAt: true },
      }),
      // Completed tasks with no such record at any time: older tasks, or ones created as Completed.
      prisma.task.count({ where: { status: "COMPLETED", project, activities: { none: movedToCompleted } } }),
      prisma.task.groupBy({ by: ["projectId", "status"], where: { project }, _count: { _all: true } }),
      prisma.project.findMany({
        where: project,
        select: { id: true, name: true, team: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { status: "IN_REVIEW", project },
        select: {
          id: true,
          title: true,
          priority: true,
          updatedAt: true,
          project: { select: { id: true, name: true } },
          assignee: { select: { name: true, email: true, ...avatarSelect } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: REVIEW_LIST_SIZE,
      }),
    ]);

  const { statusCounts, priorityCounts } = tallyStatusAndPriority(groups);

  const completedPerMonth = new Map<string, number>();

  for (const completion of completions) {
    const key = completion._max.createdAt?.toISOString().slice(0, 7);
    if (key) completedPerMonth.set(key, (completedPerMonth.get(key) ?? 0) + 1);
  }

  const months = ranges.map(({ start, key }, index) => ({
    key,
    label: monthLabel.format(start),
    longLabel: monthLongLabel.format(start),
    created: createdPerMonth[index],
    completed: completedPerMonth.get(key) ?? 0,
  }));

  const perProject = new Map<string, { total: number; completed: number }>();

  for (const group of projectGroups) {
    const stat = perProject.get(group.projectId) ?? { total: 0, completed: 0 };

    stat.total += group._count._all;
    if (group.status === "COMPLETED") stat.completed += group._count._all;
    perProject.set(group.projectId, stat);
  }

  const projectStats = projects
    .map((item) => ({
      id: item.id,
      name: item.name,
      team: item.team?.name ?? null,
      ...(perProject.get(item.id) ?? { total: 0, completed: 0 }),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    statusCounts,
    priorityCounts,
    months,
    undatedCompleted,
    projects: projectStats.slice(0, PROJECT_STATS_SIZE),
    projectCount: projectStats.length,
    reviewTasks: reviewTasks.map(({ assignee, ...task }) => ({
      ...task,
      updatedAt: task.updatedAt.toISOString(),
      assignee: assignee ? { name: assignee.name, email: assignee.email, avatar: toAvatarRef(assignee) } : null,
    })),
  };
}
