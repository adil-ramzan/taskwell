import "server-only";

import { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { reminderInstant, type ReminderInput, type ReminderOffset } from "@/lib/reminder-rules";

/*
 * Task reminders. A reminder is personal: "remind ME n minutes before this
 * task is due". It belongs to the user who set it, only that user can see,
 * change or remove it, and only that user is notified. Every function takes
 * the user ID from the server-side session and finds the task through the
 * project access rule (lib/access.ts), so a task the user can't open is the
 * same as one that doesn't exist.
 *
 * Delivery is done by processDueReminders, which the server runs on a timer
 * (lib/reminder-scheduler.ts). It writes ordinary Notification rows; there is
 * no second notification system.
 */

export type ReminderSummary = {
  id: string;
  minutesBefore: ReminderOffset;
  /** ISO instant it fires; null while the task has no due date. */
  remindAt: string | null;
  /** True once it has been sent, or passed over (the task was completed or out of reach at that moment). */
  processed: boolean;
};

export const reminderSelect = { id: true, minutesBefore: true, remindAt: true, processedAt: true } as const;

type ReminderRow = Prisma.TaskReminderGetPayload<{ select: typeof reminderSelect }>;

export const toReminderSummary = (row: ReminderRow): ReminderSummary => ({
  id: row.id,
  minutesBefore: row.minutesBefore as ReminderOffset,
  remindAt: row.remindAt?.toISOString() ?? null,
  processed: row.processedAt !== null,
});

export type ReminderError =
  | "task-not-found"
  | "reminder-not-found"
  | "reminder-duplicate"
  | "reminder-completed"
  | "reminder-no-due-date"
  | "reminder-past-due";

const accessible = (userId: string) => ({ project: projectAccessWhere(userId) });

/** The zone a whole-day offset is counted in: the account's saved zone, else the one the browser sent, else none. */
export async function reminderTimeZone(userId: string, sent: string | undefined) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });

  return account?.timeZone ?? sent ?? null;
}

/** When a reminder fires and whether there is anything left to wait for. A due date that has passed needs no reminder. */
function schedule(dueDate: Date | null, minutesBefore: number, timeZone: string | null, now: Date) {
  return {
    remindAt: dueDate ? reminderInstant(dueDate, minutesBefore, timeZone) : null,
    processedAt: dueDate && dueDate.getTime() <= now.getTime() ? now : null,
  };
}

/** Rows for a new task's reminders (nested create). */
export function reminderCreateRows(
  userId: string,
  offsets: readonly number[],
  dueDate: Date | string | null,
  timeZone: string | null,
  now: Date,
) {
  const due = dueDate ? new Date(dueDate) : null;

  return offsets.map((minutesBefore) => ({ userId, minutesBefore, timeZone, ...schedule(due, minutesBefore, timeZone, now) }));
}

/** Why this task can't be given a reminder now, if it can't. */
function ineligible(task: { status: string; dueDate: Date | null }, now: Date): ReminderError | null {
  if (task.status === "COMPLETED") return "reminder-completed";
  if (!task.dueDate) return "reminder-no-due-date";

  return task.dueDate.getTime() <= now.getTime() ? "reminder-past-due" : null;
}

const findTask = (userId: string, taskId: string) =>
  prisma.task.findFirst({ where: { id: taskId, ...accessible(userId) }, select: { status: true, dueDate: true } });

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** This user's reminders on a task, soonest offset first; null when the task isn't accessible. */
export async function listReminders(userId: string, taskId: string): Promise<ReminderSummary[] | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...accessible(userId) },
    select: { reminders: { where: { userId }, select: reminderSelect, orderBy: { minutesBefore: "asc" } } },
  });

  return task ? task.reminders.map(toReminderSummary) : null;
}

export async function addReminder(
  userId: string,
  taskId: string,
  input: ReminderInput,
): Promise<{ reminder: ReminderSummary } | { error: ReminderError }> {
  const now = new Date();
  const task = await findTask(userId, taskId);

  if (!task) return { error: "task-not-found" };

  const problem = ineligible(task, now);
  if (problem) return { error: problem };

  const timeZone = await reminderTimeZone(userId, input.timeZone);

  try {
    const reminder = await prisma.taskReminder.create({
      data: { taskId, userId, minutesBefore: input.minutesBefore, timeZone, ...schedule(task.dueDate, input.minutesBefore, timeZone, now) },
      select: reminderSelect,
    });

    return { reminder: toReminderSummary(reminder) };
  } catch (error) {
    // The unique (task, user, offset) index: also what stops two simultaneous requests both adding it.
    if (isUniqueViolation(error)) return { error: "reminder-duplicate" };
    // The task was deleted in between.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { error: "task-not-found" };

    throw error;
  }
}

/** Changes a reminder's offset. It is scheduled afresh, so it can fire again for its new time. */
export async function updateReminder(
  userId: string,
  taskId: string,
  reminderId: string,
  input: ReminderInput,
): Promise<{ reminder: ReminderSummary } | { error: ReminderError }> {
  const now = new Date();
  const task = await findTask(userId, taskId);

  if (!task) return { error: "task-not-found" };

  // Someone else's reminder, or one on another task, is simply not found.
  const current = await prisma.taskReminder.findFirst({
    where: { id: reminderId, taskId, userId },
    select: { ...reminderSelect, timeZone: true },
  });

  if (!current) return { error: "reminder-not-found" };
  if (current.minutesBefore === input.minutesBefore) return { reminder: toReminderSummary(current) };

  const problem = ineligible(task, now);
  if (problem) return { error: problem };

  const timeZone = await reminderTimeZone(userId, input.timeZone);

  try {
    const { count } = await prisma.taskReminder.updateMany({
      where: { id: reminderId, taskId, userId },
      data: { minutesBefore: input.minutesBefore, timeZone, ...schedule(task.dueDate, input.minutesBefore, timeZone, now) },
    });

    if (count === 0) return { error: "reminder-not-found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "reminder-duplicate" };

    throw error;
  }

  const reminder = await prisma.taskReminder.findFirst({ where: { id: reminderId, userId }, select: reminderSelect });

  return reminder ? { reminder: toReminderSummary(reminder) } : { error: "reminder-not-found" };
}

export async function removeReminder(userId: string, taskId: string, reminderId: string): Promise<"removed" | ReminderError> {
  if (!(await findTask(userId, taskId))) return "task-not-found";

  const { count } = await prisma.taskReminder.deleteMany({ where: { id: reminderId, taskId, userId } });

  return count > 0 ? "removed" : "reminder-not-found";
}

/**
 * Makes this user's reminders on a task exactly `offsets` (the task form's
 * checkboxes), inside the transaction that saves the task. Reminders that
 * stay are left as they are, so one that has already fired doesn't fire again.
 */
export async function replaceReminders(
  tx: Prisma.TransactionClient,
  userId: string,
  taskId: string,
  offsets: readonly number[],
  dueDate: Date | null,
  timeZone: string | null,
  now: Date,
) {
  await tx.taskReminder.deleteMany({ where: { taskId, userId, minutesBefore: { notIn: [...offsets] } } });

  if (offsets.length > 0) {
    await tx.taskReminder.createMany({
      data: reminderCreateRows(userId, offsets, dueDate, timeZone, now).map((row) => ({ ...row, taskId })),
      // Those the user already has.
      skipDuplicates: true,
    });
  }
}

/**
 * A task's due date changed: every reminder on it (whoever's it is) moves with
 * it and is armed again, so each fires once for the new time. Without a due
 * date they wait; with one already in the past there is nothing to remind of.
 */
export async function rescheduleReminders(tx: Prisma.TransactionClient, taskId: string, dueDate: Date | null, now: Date) {
  const reminders = await tx.taskReminder.findMany({ where: { taskId }, select: { id: true, minutesBefore: true, timeZone: true } });

  for (const reminder of reminders) {
    await tx.taskReminder.update({
      where: { id: reminder.id },
      data: schedule(dueDate, reminder.minutesBefore, reminder.timeZone, now),
    });
  }
}

/**
 * A repeating task's next occurrence gets the same reminders as the one just
 * completed (each person's own offsets), scheduled for the new due date and
 * not yet sent. The old task's reminders stay with it and are never sent
 * again: it is completed.
 */
export async function copyRemindersToOccurrence(
  tx: Prisma.TransactionClient,
  fromTaskId: string,
  toTaskId: string,
  dueDate: Date,
  now: Date,
) {
  const reminders = await tx.taskReminder.findMany({
    where: { taskId: fromTaskId },
    select: { userId: true, minutesBefore: true, timeZone: true },
  });

  if (reminders.length === 0) return;

  await tx.taskReminder.createMany({
    data: reminders.map((reminder) => ({
      taskId: toTaskId,
      ...reminder,
      ...schedule(dueDate, reminder.minutesBefore, reminder.timeZone, now),
    })),
    skipDuplicates: true,
  });
}

/** The most reminders one run handles; the rest wait for the next run a moment later. */
const BATCH = 200;

type Claimed = { id: string; taskId: string; userId: string; remindAt: Date };

/**
 * Sends the reminders whose time has come: all of them, or only `userId`'s.
 * Safe to run from several processes at once and to run again after a crash:
 *
 *  - due rows are claimed with FOR UPDATE SKIP LOCKED and marked processed in
 *    one statement, so two runs never take the same reminder;
 *  - the notifications are written in that same transaction, so a reminder is
 *    never marked without its notification, or the other way round;
 *  - Notification.reminderKey ("<reminder>:<fire time>") is unique, so even a
 *    repeated run could not notify twice for the same moment.
 *
 * A reminder is sent only if, at that moment, the task is not completed, still
 * has a due date, and its owner can still open it (the same access rule as
 * everywhere else). Otherwise it is marked processed without a notification.
 */
export async function processDueReminders(now = new Date(), userId?: string): Promise<{ processed: number; sent: number }> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<Claimed[]>`
      UPDATE "TaskReminder" AS r
      SET "processedAt" = ${now}, "updatedAt" = ${now}
      FROM (
        SELECT "id" FROM "TaskReminder"
        WHERE "processedAt" IS NULL AND "remindAt" <= ${now}
          AND (${userId ?? null}::text IS NULL OR "userId" = ${userId ?? null}::text)
        ORDER BY "remindAt"
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      ) AS due
      WHERE r."id" = due."id"
      RETURNING r."id", r."taskId", r."userId", r."remindAt"`;

    if (claimed.length === 0) return { processed: 0, sent: 0 };

    // Which of them may still be sent: one query per person, through the one access rule.
    const byUser = new Map<string, Claimed[]>();

    for (const row of claimed) {
      byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    }

    const notifications: Prisma.NotificationCreateManyInput[] = [];

    for (const [ownerId, rows] of byUser) {
      const open = await tx.task.findMany({
        where: {
          id: { in: rows.map((row) => row.taskId) },
          status: { not: "COMPLETED" },
          dueDate: { not: null },
          ...accessible(ownerId),
        },
        select: { id: true },
      });
      const openIds = new Set(open.map((task) => task.id));

      for (const row of rows) {
        if (openIds.has(row.taskId)) {
          notifications.push({
            type: "TASK_REMINDER",
            recipientId: ownerId,
            taskId: row.taskId,
            reminderKey: `${row.id}:${new Date(row.remindAt).getTime()}`,
          });
        }
      }
    }

    const { count } =
      notifications.length > 0
        ? await tx.notification.createMany({ data: notifications, skipDuplicates: true })
        : { count: 0 };

    return { processed: claimed.length, sent: count };
  });
}
