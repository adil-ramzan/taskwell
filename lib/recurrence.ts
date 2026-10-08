import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { activityRow } from "@/lib/activity";
import { copyLabelsToOccurrence } from "@/lib/labels";
import { copyRemindersToOccurrence } from "@/lib/reminders";
import { addDays } from "@/lib/calendar-dates";
import {
  dueTimeOf,
  nextDueDate,
  upcomingOccurrence,
  type RecurrenceInput,
  type RecurrenceRule,
  type RecurrenceSchedule,
} from "@/lib/recurrence-rules";

/*
 * Repeating tasks. A repeating task is an ordinary task with a TaskRecurrence
 * row. The row belongs to one task at a time: the series' open occurrence.
 *
 * The next occurrence is created at exactly one moment: when that task's
 * status changes to Completed (lib/tasks.ts, updateTask), in the same
 * transaction as the status change. The row then moves to the new task, so
 * there is only ever one open occurrence and nothing is created ahead of time.
 *
 * Nothing here checks access: every function is called by lib/tasks.ts after
 * the task has been found through the project access rule (lib/access.ts).
 */

export const recurrenceSelect = {
  frequency: true,
  interval: true,
  weekdays: true,
  monthDay: true,
  startDate: true,
  endDate: true,
  occurrenceLimit: true,
  occurrenceCount: true,
  dueTime: true,
  timeZone: true,
  active: true,
} as const;

export type RecurrenceRow = Prisma.TaskRecurrenceGetPayload<{ select: typeof recurrenceSelect }>;

/** Serializable shape for the task page and the API. */
export type RecurrenceSummary = RecurrenceSchedule & {
  /** False once repeating has been turned off; the settings are kept. */
  active: boolean;
  /**
   * ISO instant the next occurrence would be due if the task were completed now.
   * Null when repeating is off or the series is over (end date or occurrence limit).
   */
  nextDueDate: string | null;
};

export type RecurrenceError =
  | "recurrence-subtask"
  | "recurrence-completed"
  | "recurrence-limit-reached"
  | "recurrence-no-time-zone"
  | "recurrence-no-occurrence";

// DATE columns come back as midnight UTC of that calendar day.
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

function toSchedule(row: RecurrenceRow): RecurrenceSchedule {
  return {
    frequency: row.frequency,
    interval: row.interval,
    weekdays: row.weekdays,
    monthDay: row.monthDay,
    startDate: dayOf(row.startDate),
    endDate: row.endDate ? dayOf(row.endDate) : null,
    occurrenceLimit: row.occurrenceLimit,
    occurrenceCount: row.occurrenceCount,
    dueTime: row.dueTime,
    timeZone: row.timeZone,
  };
}

export function toRecurrenceSummary(row: RecurrenceRow, dueDate: Date | null, now = new Date()): RecurrenceSummary {
  const schedule = toSchedule(row);

  return {
    ...schedule,
    active: row.active,
    nextDueDate: row.active ? (nextDueDate(schedule, dueDate, now)?.toISOString() ?? null) : null,
  };
}

/** The rule as a history record keeps it: enum values, numbers and calendar days only. */
const ruleOf = (input: RecurrenceRule): RecurrenceRule => ({
  frequency: input.frequency,
  interval: input.interval,
  weekdays: input.weekdays,
  monthDay: input.monthDay,
  startDate: input.startDate,
  endDate: input.endDate,
  occurrenceLimit: input.occurrenceLimit,
});

export type RecurrencePlan = {
  /** The row's new contents. */
  data: Omit<Prisma.TaskRecurrenceUncheckedCreateInput, "taskId">;
  rule: RecurrenceRule;
  /** Set when the task has no due date: it gets the schedule's first day that is still ahead. */
  dueDate?: string;
  /** "created" also covers turning a switched-off schedule back on. */
  kind: "created" | "updated";
  /** False when the saved schedule is already exactly this; then nothing is written. */
  changed: boolean;
};

/**
 * Works out what saving `input` on a task means. `dueDate` is the due date the
 * task will have (ISO instant or null) and `accountTimeZone` the saver's zone
 * from Settings, which wins over the zone their browser sent.
 */
export function planRecurrence(
  input: RecurrenceInput,
  existing: RecurrenceRow | null,
  dueDate: string | null,
  accountTimeZone: string | null,
  now: Date,
): RecurrencePlan | { error: RecurrenceError } {
  const timeZone = accountTimeZone ?? input.timeZone;

  if (!timeZone) return { error: "recurrence-no-time-zone" };

  const occurrenceCount = existing?.occurrenceCount ?? 1;

  if (input.occurrenceLimit !== null && input.occurrenceLimit < occurrenceCount) {
    return { error: "recurrence-limit-reached" };
  }

  const rule = ruleOf(input);
  let dueTime: string | null = null;
  let firstDueDate: string | undefined;

  if (dueDate) {
    // The schedule repeats the task's own time of day.
    dueTime = dueTimeOf(dueDate, timeZone);
  } else {
    const first = upcomingOccurrence({ ...rule, dueTime, timeZone }, addDays(rule.startDate, -1), now);

    if (!first) return { error: "recurrence-no-occurrence" };

    firstDueDate = first.dueDate.toISOString();
  }

  const saved = existing ? toSchedule(existing) : null;
  const changed =
    !saved ||
    !existing?.active ||
    saved.dueTime !== dueTime ||
    saved.timeZone !== timeZone ||
    JSON.stringify(ruleOf(saved)) !== JSON.stringify(rule);

  return {
    data: {
      frequency: rule.frequency,
      interval: rule.interval,
      weekdays: rule.weekdays,
      monthDay: rule.monthDay,
      startDate: dateOf(rule.startDate),
      endDate: rule.endDate ? dateOf(rule.endDate) : null,
      occurrenceLimit: rule.occurrenceLimit,
      dueTime,
      timeZone,
      active: true,
    },
    rule,
    dueDate: firstDueDate,
    kind: existing?.active ? "updated" : "created",
    changed,
  };
}

/** Two requests tried to create the same next occurrence; the transaction of the one that lost is rolled back. */
export class OccurrenceConflictError extends Error {
  constructor() {
    super("The next occurrence of this task already exists.");
    this.name = "OccurrenceConflictError";
  }
}

/**
 * Creates the occurrence that follows a task which has just been completed,
 * inside the transaction that completed it. Returns the new task's ID, or null
 * when there is nothing to create: the task doesn't repeat, repeating is off,
 * it is a subtask, or the series is over.
 *
 * The new task copies the title, description, priority, project and (while
 * they are still in the project's team) the assignee, starts as To do, and is
 * due on the next scheduled day. Subtasks, dependencies, comments and history
 * are not copied.
 *
 * It can only happen once per task: the schedule row moves to the new task in
 * the same transaction, and Task.recurredFromId is unique, so a second attempt
 * (a repeated request, a race, a task reopened and completed again) finds no
 * schedule on this task, or is refused by the database.
 */
export async function generateNextOccurrence(
  tx: Prisma.TransactionClient,
  taskId: string,
  actorId: string,
  now: Date,
): Promise<string | null> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      description: true,
      priority: true,
      status: true,
      projectId: true,
      assigneeId: true,
      dueDate: true,
      parentTaskId: true,
      project: { select: { teamId: true } },
      recurrence: { select: { id: true, ...recurrenceSelect } },
    },
  });
  const recurrence = task?.recurrence;

  if (!task || !recurrence?.active || task.parentTaskId !== null || task.status !== "COMPLETED") {
    return null;
  }

  const dueDate = nextDueDate(toSchedule(recurrence), task.dueDate, now);

  if (!dueDate) return null;

  // Kept only while that person is still in the project's team, as for any assignment.
  const { teamId } = task.project;
  const assigneeId =
    task.assigneeId &&
    teamId &&
    (await tx.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: task.assigneeId } }, select: { id: true } }))
      ? task.assigneeId
      : null;
  const id = randomUUID();
  const generated = { fromTaskId: taskId, toTaskId: id };

  await tx.task.create({
    data: {
      id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      projectId: task.projectId,
      assigneeId,
      dueDate,
      recurredFromId: taskId,
      activities: {
        create: [
          // The new task's creation record.
          { type: "RECURRENCE_GENERATED", actorId, metadata: generated },
          ...(assigneeId
            ? [{ type: "TASK_ASSIGNEE_CHANGED" as const, actorId, metadata: { fromUserId: null, toUserId: assigneeId } }]
            : []),
        ],
      },
      // The same notification as any other assignment, and likewise not for one's own action.
      notifications: {
        create: assigneeId && assigneeId !== actorId ? [{ type: "TASK_ASSIGNED" as const, recipientId: assigneeId, actorId }] : [],
      },
    },
    select: { id: true },
  });

  // The schedule now belongs to the new task. Zero rows means another request moved or changed it first.
  const { count } = await tx.taskRecurrence.updateMany({
    where: { id: recurrence.id, taskId, active: true, occurrenceCount: recurrence.occurrenceCount },
    data: { taskId: id, occurrenceCount: { increment: 1 } },
  });

  if (count !== 1) throw new OccurrenceConflictError();

  // The same labels: the new task is in the same project, so the same workspace.
  await copyLabelsToOccurrence(tx, taskId, id);

  // Each person's reminders carry over to the new occurrence, armed for its due date.
  await copyRemindersToOccurrence(tx, taskId, id, dueDate, now);

  await tx.activity.create({ data: activityRow("RECURRENCE_GENERATED", taskId, actorId, generated) });

  return id;
}
