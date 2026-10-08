import "server-only";

import { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import type { DependencyInput, TaskStatusValue } from "@/lib/task-validation";
import { lockProjectRelations } from "@/lib/tasks";

/*
 * Dependencies between tasks. One row means "blocker blocks blocked": the
 * blocked task is waiting for the blocker. Both tasks are always in the same
 * project, so the project access rule (lib/access.ts) that lets a user open
 * one of them lets them open the other; every function still applies it to
 * both, with the user ID from the session.
 *
 * A dependency is a planning note. It never changes a task's status and never
 * stops anyone changing one.
 */

/** The most other tasks offered when adding a dependency. */
export const DEPENDENCY_CANDIDATE_LIMIT = 500;

/** The task at the other end of a dependency, as the task page lists it. */
export type DependencyLink = {
  /** The dependency's own ID, for removing it. */
  id: string;
  task: { id: string; title: string; status: TaskStatusValue };
};

export type TaskDependencies = {
  /** Tasks this one is waiting for. */
  blockedBy: DependencyLink[];
  /** Tasks waiting for this one. */
  blocks: DependencyLink[];
};

const linkedTask = { select: { id: true, title: true, status: true } } as const;
const accessible = (userId: string) => ({ project: projectAccessWhere(userId) });

/** Null when the task doesn't exist or this user can't access it. */
export async function listDependencies(userId: string, taskId: string): Promise<TaskDependencies | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...accessible(userId) },
    select: {
      blockedBy: {
        where: { blocker: accessible(userId) },
        select: { id: true, blocker: linkedTask },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      blocking: {
        where: { blocked: accessible(userId) },
        select: { id: true, blocked: linkedTask },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  return task
    ? {
        blockedBy: task.blockedBy.map(({ id, blocker }) => ({ id, task: blocker })),
        blocks: task.blocking.map(({ id, blocked }) => ({ id, task: blocked })),
      }
    : null;
}

/**
 * The other tasks of the same project, by title: what "Add dependency" offers.
 * Empty when the task isn't accessible. Only the ID and title are read.
 */
export async function listDependencyCandidates(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, ...accessible(userId) }, select: { projectId: true } });

  return task
    ? prisma.task.findMany({
        where: { projectId: task.projectId, id: { not: taskId }, ...accessible(userId) },
        select: { id: true, title: true },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: DEPENDENCY_CANDIDATE_LIMIT,
      })
    : [];
}

/**
 * True when `to` can be reached from `from` by following "blocks" edges.
 * Iterative breadth-first walk over the project's edges, each task visited once,
 * so it ends on any graph, however long the chain.
 */
function reaches(edges: { blockerTaskId: string; blockedTaskId: string }[], from: string, to: string) {
  const blockedBy = new Map<string, string[]>();

  for (const edge of edges) {
    const list = blockedBy.get(edge.blockerTaskId);
    if (list) list.push(edge.blockedTaskId);
    else blockedBy.set(edge.blockerTaskId, [edge.blockedTaskId]);
  }

  const seen = new Set([from]);
  const queue = [from];

  for (let index = 0; index < queue.length; index += 1) {
    if (queue[index] === to) return true;

    for (const next of blockedBy.get(queue[index]) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

export type DependencyError =
  /** Either task is missing or not accessible; the answer doesn't say which. */
  | "task-not-found"
  | "self-dependency"
  | "other-project"
  | "duplicate"
  | "cycle";

/**
 * Adds "taskId is blocked by other" or "taskId blocks other". Refused when the
 * two are the same task, are in different projects, already have that
 * dependency, or when the new edge would close a loop: A blocks B is a cycle
 * exactly when B already blocks A, directly or through any number of tasks.
 * The check and the insert run under the project's relationship lock, so two
 * simultaneous requests can't each add half of a loop.
 */
export async function addDependency(
  userId: string,
  taskId: string,
  input: DependencyInput,
): Promise<{ dependency: DependencyLink } | { error: DependencyError }> {
  // Asked for separately so an inaccessible task and a missing one look the same, whichever of the two it is.
  const tasks = await prisma.task.findMany({
    where: { id: { in: [taskId, input.taskId] }, ...accessible(userId) },
    select: { id: true, projectId: true },
  });
  const task = tasks.find(({ id }) => id === taskId);
  const other = tasks.find(({ id }) => id === input.taskId);

  if (!task || !other) return { error: "task-not-found" };
  if (taskId === input.taskId) return { error: "self-dependency" };
  if (task.projectId !== other.projectId) return { error: "other-project" };

  const [blockerTaskId, blockedTaskId] = input.relation === "blocked-by" ? [other.id, task.id] : [task.id, other.id];

  try {
    return await prisma.$transaction(async (tx) => {
      await lockProjectRelations(tx, task.projectId);

      // Every edge of this project (both ends are always in it), and the two tasks as they are now.
      const [edges, still] = await Promise.all([
        tx.taskDependency.findMany({
          where: { blocker: { projectId: task.projectId } },
          select: { blockerTaskId: true, blockedTaskId: true },
        }),
        tx.task.count({ where: { id: { in: [task.id, other.id] }, projectId: task.projectId } }),
      ]);

      if (still !== 2) return { error: "task-not-found" as const };

      if (edges.some((edge) => edge.blockerTaskId === blockerTaskId && edge.blockedTaskId === blockedTaskId)) {
        return { error: "duplicate" as const };
      }

      if (reaches(edges, blockedTaskId, blockerTaskId)) return { error: "cycle" as const };

      const created = await tx.taskDependency.create({
        data: { blockerTaskId, blockedTaskId },
        select: { id: true, blocker: linkedTask, blocked: linkedTask },
      });

      // In both tasks' histories, since it shows on both tasks' pages.
      await tx.activity.createMany({
        data: [blockerTaskId, blockedTaskId].map((id) =>
          activityRow("DEPENDENCY_ADDED", id, userId, { blockerTaskId, blockedTaskId }),
        ),
      });

      return { dependency: { id: created.id, task: input.relation === "blocked-by" ? created.blocker : created.blocked } };
    });
  } catch (error) {
    // The unique index, should the same dependency arrive twice despite the lock.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "duplicate" };
    }

    throw error;
  }
}

/**
 * Removes one dependency of `taskId` (on either side of it). False when the
 * task isn't accessible, or the dependency doesn't exist or isn't one of this
 * task's.
 */
export async function removeDependency(userId: string, taskId: string, dependencyId: string) {
  return prisma.$transaction(async (tx) => {
    const dependency = await tx.taskDependency.findFirst({
      where: {
        id: dependencyId,
        OR: [{ blockerTaskId: taskId }, { blockedTaskId: taskId }],
        blocker: accessible(userId),
        blocked: accessible(userId),
      },
      select: { blockerTaskId: true, blockedTaskId: true },
    });

    if (!dependency) return false;

    const { count } = await tx.taskDependency.deleteMany({ where: { id: dependencyId } });

    if (count === 0) return false;

    await tx.activity.createMany({
      data: [dependency.blockerTaskId, dependency.blockedTaskId].map((id) =>
        activityRow("DEPENDENCY_REMOVED", id, userId, dependency),
      ),
    });

    return true;
  });
}
