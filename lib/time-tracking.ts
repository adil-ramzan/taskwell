import "server-only";

import { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/team-validation";
import { entrySeconds, MAX_ENTRY_SECONDS, TIME_ENTRY_PAGE_SIZE, type TimeEntryInput } from "@/lib/time-rules";

/*
 * Time tracking. An entry is one person's stretch of time on one task; the one
 * with no end is that person's running timer, and there is at most one of
 * those per user (a partial unique index in the database, and a per-user lock
 * here). The access rule is the task's own, and nothing else: whoever can open
 * the task can track time on it and read its entries. An entry can be changed
 * only by the person it belongs to, and deleted by them or, in a team task, by
 * the team's owner and admins (the rule comments follow). Every function takes
 * the user ID from the server-side session; a task the user can't access, and
 * an entry that isn't on that task, are both "not found".
 *
 * Durations are always worked out here, from the server's clock for the timer
 * and from start + minutes for a manual entry. An end or a duration sent by
 * the browser is never used.
 */

/** Null when the user can't access the task; otherwise whether they may delete other people's entries on it. */
async function getTaskAccess(userId: string, taskId: string) {
  if (taskId.length > 100) return null;

  const task = await prisma.task.findFirst({
    where: { id: taskId, project: projectAccessWhere(userId) },
    select: {
      project: { select: { team: { select: { memberships: { where: { userId }, select: { role: true } } } } } },
    },
  });

  if (!task) return null;

  const role = task.project.team?.memberships[0]?.role;

  // Moderation exists only in team tasks, for the team's owner and admins.
  return { canModerate: role !== undefined && canManageTeam(role) };
}

export type TimeEntrySummary = {
  id: string;
  startedAt: string;
  /** Null while the entry is its owner's running timer. */
  endedAt: string | null;
  /** Null while running. */
  seconds: number | null;
  note: string | null;
  manual: boolean;
  user: { name: string; email: string; avatar: AvatarRef | null };
  /** The reader's own entry. */
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** A running timer, as the person it belongs to sees it. */
export type RunningTimer = { id: string; startedAt: string; task: { id: string; title: string } };

export type TaskTime = {
  /** The newest entries (up to TIME_ENTRY_PAGE_SIZE), running ones included. */
  entries: TimeEntrySummary[];
  /** Finished entries of everyone, all of them, in seconds. */
  totalSeconds: number;
  /** How many entries the task has, finished or running. */
  count: number;
  /** The reader's running timer, on this task or another; null when they have none. */
  running: RunningTimer | null;
  /** The server's clock when this was read, so a browser with a wrong clock still counts correctly. */
  now: string;
};

const entrySelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  note: true,
  manual: true,
  userId: true,
  user: { select: { name: true, email: true, ...avatarSelect } },
} as const;

type EntryRow = Prisma.TaskTimeEntryGetPayload<{ select: typeof entrySelect }>;

function toSummary(row: EntryRow, userId: string, canModerate: boolean): TimeEntrySummary {
  const mine = row.userId === userId;

  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    seconds: row.durationSeconds,
    note: row.note,
    manual: row.manual,
    user: { name: row.user.name, email: row.user.email, avatar: toAvatarRef(row.user) },
    mine,
    // A running timer is stopped, not edited.
    canEdit: mine && row.endedAt !== null,
    canDelete: mine || canModerate,
  };
}

/**
 * The user's running timer, if any. The task's title is only given while they
 * can still open that task; a timer on a task they have lost access to still
 * shows (so it can be stopped), without naming it.
 */
export async function getRunningTimer(userId: string): Promise<RunningTimer | null> {
  const entry = await prisma.taskTimeEntry.findFirst({
    where: { userId, endedAt: null },
    select: { id: true, startedAt: true, taskId: true },
  });

  if (!entry) return null;

  const task = await prisma.task.findFirst({
    where: { id: entry.taskId, project: projectAccessWhere(userId) },
    select: { title: true },
  });

  return { id: entry.id, startedAt: entry.startedAt.toISOString(), task: { id: entry.taskId, title: task?.title ?? "" } };
}

/** A task's time: its entries, the total, and the reader's running timer. Null when the task isn't accessible. */
export async function getTaskTime(userId: string, taskId: string): Promise<TaskTime | null> {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return null;

  const [rows, total, count, running] = await Promise.all([
    prisma.taskTimeEntry.findMany({
      where: { taskId },
      select: entrySelect,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: TIME_ENTRY_PAGE_SIZE,
    }),
    prisma.taskTimeEntry.aggregate({ where: { taskId }, _sum: { durationSeconds: true } }),
    prisma.taskTimeEntry.count({ where: { taskId } }),
    getRunningTimer(userId),
  ]);

  return {
    entries: rows.map((row) => toSummary(row, userId, access.canModerate)),
    totalSeconds: total._sum.durationSeconds ?? 0,
    count,
    running,
    now: new Date().toISOString(),
  };
}

export type TimeError =
  | "task-not-found"
  | "time-entry-not-found"
  | "time-forbidden"
  | "time-no-timer"
  | "time-running"
  | "time-in-future";

/**
 * Serialises one user's timer changes for the rest of the transaction, so two
 * simultaneous starts (or a start and a stop) happen one after the other. The
 * partial unique index is what finally guarantees a single running timer.
 */
async function lockTimer(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timer:${userId}`}))`;
}

/**
 * Ends the user's running timer (optionally only one on a task matching
 * `where`) at `now`, or 24 hours after it started if that came first, and
 * records the time in the task's history. Null when nothing was running.
 */
async function stopRunning(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  where: Prisma.TaskTimeEntryWhereInput = {},
) {
  const running = await tx.taskTimeEntry.findFirst({
    where: { AND: [{ userId, endedAt: null }, where] },
    select: { id: true, taskId: true, startedAt: true },
  });

  if (!running) return null;

  const seconds = entrySeconds(running.startedAt, now);
  // A clock that went backwards, or a timer left for days, never yields a negative or an endless entry.
  const endedAt = new Date(
    Math.min(Math.max(now.getTime(), running.startedAt.getTime()), running.startedAt.getTime() + MAX_ENTRY_SECONDS * 1000),
  );
  // Only if it is still running: a stop that lost a race changes nothing and records nothing.
  const { count } = await tx.taskTimeEntry.updateMany({
    where: { id: running.id, endedAt: null },
    data: { endedAt, durationSeconds: seconds },
  });

  if (count === 0) return null;

  await tx.activity.create({
    data: activityRow("TIME_ENTRY_ADDED", running.taskId, userId, { entryId: running.id, seconds }),
  });

  return { id: running.id, taskId: running.taskId, seconds };
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Starts the user's timer on a task. If it is already running there, nothing
 * changes; if it is running on another task, that one is stopped first (and
 * its time recorded), since a person has one timer.
 */
export async function startTimer(
  userId: string,
  taskId: string,
): Promise<{ timer: RunningTimer; started: boolean; stopped: { taskId: string; seconds: number } | null } | { error: TimeError }> {
  for (let attempt = 0; ; attempt++) {
    const task = (await getTaskAccess(userId, taskId))
      ? await prisma.task.findUnique({ where: { id: taskId }, select: { title: true } })
      : null;

    if (!task) return { error: "task-not-found" };

    try {
      return await prisma.$transaction(async (tx) => {
        await lockTimer(tx, userId);

        const existing = await tx.taskTimeEntry.findFirst({
          where: { userId, endedAt: null },
          select: { id: true, taskId: true, startedAt: true },
        });

        if (existing?.taskId === taskId) {
          return {
            timer: { id: existing.id, startedAt: existing.startedAt.toISOString(), task: { id: taskId, title: task.title } },
            started: false,
            stopped: null,
          };
        }

        const now = new Date();
        const stopped = existing ? await stopRunning(tx, userId, now) : null;
        const created = await tx.taskTimeEntry.create({
          data: { taskId, userId, startedAt: now },
          select: { id: true, startedAt: true },
        });

        return {
          timer: { id: created.id, startedAt: created.startedAt.toISOString(), task: { id: taskId, title: task.title } },
          started: true,
          stopped: stopped && { taskId: stopped.taskId, seconds: stopped.seconds },
        };
      });
    } catch (error) {
      // The index refused a second running timer (a start that slipped past the lock): look again.
      // A task deleted in the same instant (P2003) is simply not found on the next reading.
      const retry =
        isUniqueViolation(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003");

      if (!retry || attempt >= 2) throw error;
    }
  }
}

/** Stops the user's running timer, wherever it is. "time-no-timer" when none is running (also for the loser of two stops). */
export async function stopTimer(
  userId: string,
): Promise<{ entry: { id: string; taskId: string; seconds: number } } | { error: TimeError }> {
  const stopped = await prisma.$transaction(async (tx) => {
    await lockTimer(tx, userId);

    return stopRunning(tx, userId, new Date());
  });

  return stopped ? { entry: stopped } : { error: "time-no-timer" };
}

/**
 * Stops a person's running timer if it is on a task of this team. Called in
 * the transaction that removes them from the team, so no timer keeps counting
 * on a task its owner can no longer open.
 */
export async function stopTimerInTeam(tx: Prisma.TransactionClient, userId: string, teamId: string) {
  await stopRunning(tx, userId, new Date(), { task: { project: { teamId } } });
}

const readEntry = async (userId: string, canModerate: boolean, entryId: string) => {
  const row = await prisma.taskTimeEntry.findUnique({ where: { id: entryId }, select: entrySelect });

  return row ? toSummary(row, userId, canModerate) : null;
};

/** Adds a finished entry for the user: `minutes` from `startedAt`. It can't reach into the future. */
export async function createTimeEntry(
  userId: string,
  taskId: string,
  input: TimeEntryInput,
): Promise<{ entry: TimeEntrySummary } | { error: TimeError }> {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return { error: "task-not-found" };

  const seconds = input.minutes * 60;
  const endedAt = new Date(input.startedAt.getTime() + seconds * 1000);

  if (endedAt.getTime() > Date.now()) return { error: "time-in-future" };

  try {
    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.taskTimeEntry.create({
        data: { taskId, userId, startedAt: input.startedAt, endedAt, durationSeconds: seconds, note: input.note, manual: true },
        select: { id: true },
      });

      await tx.activity.create({
        data: activityRow("TIME_ENTRY_ADDED", taskId, userId, { entryId: created.id, seconds, manual: true }),
      });

      return created.id;
    });
    const entry = await readEntry(userId, access.canModerate, id);

    return entry ? { entry } : { error: "time-entry-not-found" };
  } catch (error) {
    // The task was deleted in the same instant.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { error: "task-not-found" };

    throw error;
  }
}

/** The entry if it is on this task and the user can open the task. */
type FoundEntry = {
  access: { canModerate: boolean };
  entry: { id: string; userId: string; startedAt: Date; endedAt: Date | null; durationSeconds: number | null };
};

async function findEntry(userId: string, taskId: string, entryId: string): Promise<FoundEntry | { error: TimeError }> {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return { error: "task-not-found" };
  if (entryId.length > 100) return { error: "time-entry-not-found" };

  const entry = await prisma.taskTimeEntry.findFirst({
    where: { id: entryId, taskId },
    select: { id: true, userId: true, startedAt: true, endedAt: true, durationSeconds: true },
  });

  return entry ? { access, entry } : { error: "time-entry-not-found" };
}

/**
 * Changes the user's own finished entry: its start, its length, its note.
 * A new start keeps the length and a new length keeps the start; the end is
 * always worked out here. A running timer is stopped, not edited.
 */
export async function updateTimeEntry(
  userId: string,
  taskId: string,
  entryId: string,
  input: Partial<TimeEntryInput>,
): Promise<{ entry: TimeEntrySummary } | { error: TimeError }> {
  const found = await findEntry(userId, taskId, entryId);

  if ("error" in found) return found;

  const { entry, access } = found;

  if (entry.userId !== userId) return { error: "time-forbidden" };
  if (entry.endedAt === null || entry.durationSeconds === null) return { error: "time-running" };

  const startedAt = input.startedAt ?? entry.startedAt;
  const seconds = input.minutes !== undefined ? input.minutes * 60 : entry.durationSeconds;
  const endedAt = new Date(startedAt.getTime() + seconds * 1000);
  const timeChanged = startedAt.getTime() !== entry.startedAt.getTime() || seconds !== entry.durationSeconds;

  if (timeChanged && endedAt.getTime() > Date.now()) return { error: "time-in-future" };

  const written = await prisma.$transaction(async (tx) => {
    // The owner and the finished state are part of the statement, so they still hold at the moment of the write.
    const { count } = await tx.taskTimeEntry.updateMany({
      where: { id: entryId, taskId, userId, endedAt: { not: null } },
      data: {
        ...(timeChanged ? { startedAt, endedAt, durationSeconds: seconds } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });

    if (count === 0) return false;

    // A note is not time: only a change of when or how long goes into the task's history.
    if (timeChanged) {
      await tx.activity.create({ data: activityRow("TIME_ENTRY_UPDATED", taskId, userId, { entryId, seconds }) });
    }

    return true;
  });

  const updated = written ? await readEntry(userId, access.canModerate, entryId) : null;

  return updated ? { entry: updated } : { error: "time-entry-not-found" };
}

/**
 * Deletes an entry: the user's own, or anyone's as the team's owner or admin.
 * Deleting one's own running timer discards it, which leaves no trace: no time was recorded.
 */
export async function deleteTimeEntry(
  userId: string,
  taskId: string,
  entryId: string,
): Promise<{ deleted: true } | { error: TimeError }> {
  const found = await findEntry(userId, taskId, entryId);

  if ("error" in found) return found;

  const { entry, access } = found;

  if (entry.userId !== userId && !access.canModerate) return { error: "time-forbidden" };

  const deleted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.taskTimeEntry.deleteMany({
      where: { id: entryId, taskId, ...(access.canModerate ? {} : { userId }) },
    });

    if (count === 0) return false;

    if (entry.durationSeconds !== null) {
      await tx.activity.create({
        data: activityRow("TIME_ENTRY_DELETED", taskId, userId, {
          entryId,
          seconds: entry.durationSeconds,
          authorId: entry.userId,
        }),
      });
    }

    return true;
  });

  return deleted ? { deleted: true } : { error: "time-entry-not-found" };
}

/* --------------------------------- Reports -------------------------------- */

type Range = { start: Date; end: Date };

/** The part of an entry that falls inside [start, end), in whole seconds. */
const overlapSeconds = (entry: { startedAt: Date; endedAt: Date | null }, { start, end }: Range) =>
  entry.endedAt
    ? Math.max(
        0,
        Math.floor((Math.min(entry.endedAt.getTime(), end.getTime()) - Math.max(entry.startedAt.getTime(), start.getTime())) / 1000),
      )
    : 0;

/**
 * Seconds tracked inside a range, per task, for finished entries of tasks
 * matching `task`. An entry that crosses the start or the end of the range
 * (a session over midnight, say) counts only for the part inside it, so two
 * adjoining ranges never count the same minute twice. Entries wholly inside
 * are summed by the database; only the few that cross a boundary are read.
 */
export async function trackedSecondsByTask(task: Prisma.TaskWhereInput, range: Range): Promise<Map<string, number>> {
  const overlapping: Prisma.TaskTimeEntryWhereInput = {
    task,
    endedAt: { not: null, gt: range.start },
    startedAt: { lt: range.end },
  };
  const inside: Prisma.TaskTimeEntryWhereInput = { startedAt: { gte: range.start }, endedAt: { not: null, lte: range.end } };
  const [whole, crossing] = await Promise.all([
    prisma.taskTimeEntry.groupBy({ by: ["taskId"], where: { AND: [overlapping, inside] }, _sum: { durationSeconds: true } }),
    prisma.taskTimeEntry.findMany({
      where: { AND: [overlapping, { NOT: inside }] },
      select: { taskId: true, startedAt: true, endedAt: true },
    }),
  ]);
  const seconds = new Map<string, number>();

  for (const row of whole) seconds.set(row.taskId, row._sum.durationSeconds ?? 0);
  for (const entry of crossing) seconds.set(entry.taskId, (seconds.get(entry.taskId) ?? 0) + overlapSeconds(entry, range));

  return seconds;
}

/** The same, added up over all matching tasks. */
export async function trackedSecondsTotal(task: Prisma.TaskWhereInput, range: Range) {
  let total = 0;

  for (const seconds of (await trackedSecondsByTask(task, range)).values()) total += seconds;

  return total;
}
