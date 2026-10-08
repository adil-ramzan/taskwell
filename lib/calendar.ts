import "server-only";

import type { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { MAX_CALENDAR_RANGE_DAYS, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from "@/lib/calendar-dates";
import { prisma } from "@/lib/prisma";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";

/*
 * The calendar's one query. Like every task query, access comes from the
 * task's project (lib/access.ts) for the user ID taken from the session; the
 * scope and filters below are ANDed with that rule, so they can only narrow
 * what the user may already see. A project, team or person ID that isn't
 * theirs simply matches nothing.
 */

/** The most tasks one range returns; `truncated` says when there were more. */
export const CALENDAR_TASK_LIMIT = 500;

const HOUR_MS = 3_600_000;
// Whole local days are 23 to 25 hours long, so a 62-day range can run an hour or so over 62 × 24 h.
const MAX_RANGE_MS = MAX_CALENDAR_RANGE_DAYS * 24 * HOUR_MS + 2 * HOUR_MS;

/** "all", "personal", every team the user is in ("team"), or one team. */
export type CalendarScope = "all" | "personal" | "team" | { teamId: string };

export type CalendarQuery = {
  start: Date;
  end: Date;
  scope: CalendarScope;
  projectId?: string;
  /** "me", "unassigned" or a user ID. */
  assignee?: string;
  status?: TaskStatusValue;
  priority?: TaskPriorityValue;
};

/** What a calendar entry shows; nothing else about the task, its project or its people is sent. */
export type CalendarTask = {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** ISO instant. */
  dueDate: string;
  project: { id: string; name: string; teamId: string | null };
  assignee: { id: string; name: string; email: string; avatar: AvatarRef | null } | null;
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_ID_LENGTH = 100;

function parseInstant(value: string | null) {
  const time = value && ISO_INSTANT.test(value) ? Date.parse(value) : NaN;

  if (Number.isNaN(time)) return null;

  const date = new Date(time);
  const year = date.getUTCFullYear();

  // One year of slack around the supported due dates, for ranges that start or end in a neighbouring zone's year.
  return year >= MIN_CALENDAR_YEAR - 1 && year <= MAX_CALENDAR_YEAR + 1 ? date : null;
}

const oneOf = <T extends string>(values: readonly T[], value: string): value is T => values.includes(value as T);

/**
 * Reads and checks the query string. Every problem is a message for a 400;
 * nothing here grants access, it only shapes the filter.
 */
export function parseCalendarQuery(params: URLSearchParams): { data: CalendarQuery } | { error: string } {
  const start = parseInstant(params.get("start"));
  const end = parseInstant(params.get("end"));

  if (!start || !end) {
    return { error: "Provide start and end as ISO date-times, for example 2026-10-01T00:00:00Z." };
  }

  if (end.getTime() <= start.getTime()) {
    return { error: "The end of the range must be after its start." };
  }

  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return { error: `A calendar range can cover at most ${MAX_CALENDAR_RANGE_DAYS} days.` };
  }

  const scopeParam = params.get("scope") ?? "all";
  const teamId = params.get("teamId") ?? "";

  if (!oneOf(["all", "personal", "team"] as const, scopeParam)) {
    return { error: "Scope must be all, personal or team." };
  }

  if (teamId && (scopeParam !== "team" || teamId.length > MAX_ID_LENGTH)) {
    return { error: "Choose a valid team." };
  }

  const data: CalendarQuery = { start, end, scope: scopeParam === "team" && teamId ? { teamId } : scopeParam };
  const projectId = params.get("projectId");
  const assignee = params.get("assignee");
  const status = params.get("status");
  const priority = params.get("priority");

  if (projectId) {
    if (projectId.length > MAX_ID_LENGTH) return { error: "Choose a valid project." };
    data.projectId = projectId;
  }

  if (assignee) {
    if (assignee.length > MAX_ID_LENGTH) return { error: "Choose a valid assignee." };
    data.assignee = assignee;
  }

  if (status) {
    if (!oneOf(TASK_STATUSES, status)) return { error: "Choose a valid status." };
    data.status = status;
  }

  if (priority) {
    if (!oneOf(TASK_PRIORITIES, priority)) return { error: "Choose a valid priority." };
    data.priority = priority;
  }

  return { data };
}

function scopeWhere(scope: CalendarScope): Prisma.ProjectWhereInput {
  if (scope === "all") return {};
  if (scope === "personal") return { teamId: null };
  if (scope === "team") return { teamId: { not: null } };

  return { teamId: scope.teamId };
}

/**
 * Tasks due in [start, end) that this user can access, soonest first. One
 * query with the project and assignee joined; tasks without a due date never
 * match the range.
 */
export async function listCalendarTasks(
  userId: string,
  query: CalendarQuery,
): Promise<{ tasks: CalendarTask[]; truncated: boolean }> {
  const assigneeId =
    query.assignee === undefined
      ? undefined
      : query.assignee === "me"
        ? userId
        : query.assignee === "unassigned"
          ? null
          : query.assignee;

  const rows = await prisma.task.findMany({
    where: {
      dueDate: { gte: query.start, lt: query.end },
      project: {
        AND: [
          projectAccessWhere(userId),
          scopeWhere(query.scope),
          ...(query.projectId ? [{ id: query.projectId }] : []),
        ],
      },
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      project: { select: { id: true, name: true, teamId: true } },
      assignee: { select: { id: true, name: true, email: true, ...avatarSelect } },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: CALENDAR_TASK_LIMIT + 1,
  });

  const tasks = rows.slice(0, CALENDAR_TASK_LIMIT).map(({ assignee, dueDate, ...task }) => ({
    ...task,
    // The range filter above only matches rows that have one.
    dueDate: dueDate!.toISOString(),
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email, avatar: toAvatarRef(assignee) }
      : null,
  }));

  return { tasks, truncated: rows.length > CALENDAR_TASK_LIMIT };
}
