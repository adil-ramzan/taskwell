import "server-only";

import { Prisma, TeamRole } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import {
  labelNameKey,
  MAX_LABELS_PER_TASK,
  MAX_LABELS_PER_WORKSPACE,
  type LabelColor,
  type LabelInput,
  type LabelRef,
  type LabelUpdate,
} from "@/lib/label-rules";
import { prisma } from "@/lib/prisma";

/*
 * Labels. A label belongs to one workspace: a person's personal projects
 * (Label.ownerId) or a team's projects (Label.teamId). Who can reach a label
 * follows from that, with the user ID always taken from the server-side session:
 *
 *  - see and use it: the owner, or any member of the team;
 *  - create one: the same (so a label can be made while editing a task);
 *  - rename, recolor or delete it: the owner, or the team's owner and admins.
 *
 * A task only ever carries labels of its own project's workspace: the
 * workspace is worked out from the task's project on the server, never taken
 * from the request, and a label from anywhere else is "not found".
 */

/** The workspace a label or a project belongs to. */
export type LabelScope = { ownerId: string; teamId: null } | { ownerId: null; teamId: string };

/** The workspace of a project: its team, or for a personal project its owner. */
export function scopeOfProject(project: { teamId: string | null; ownerId: string | null }): LabelScope | null {
  if (project.teamId) return { ownerId: null, teamId: project.teamId };

  // A personal project always has an owner (a database CHECK enforces it).
  return project.ownerId ? { ownerId: project.ownerId, teamId: null } : null;
}

export const scopeWhere = (scope: LabelScope): Prisma.LabelWhereInput =>
  scope.teamId ? { teamId: scope.teamId } : { ownerId: scope.ownerId, teamId: null };

/** Labels the user can see and put on tasks. */
export function labelAccessWhere(userId: string): Prisma.LabelWhereInput {
  return { OR: [{ ownerId: userId }, { team: { memberships: { some: { userId } } } }] };
}

/** Labels the user can rename, recolor or delete. */
function labelManageWhere(userId: string): Prisma.LabelWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { team: { memberships: { some: { userId, role: { in: [TeamRole.OWNER, TeamRole.ADMIN] } } } } },
    ],
  };
}

export const labelRefSelect = { id: true, name: true, color: true } as const;

type LabelRefRow = { id: string; name: string; color: string };

export const toLabelRef = (row: LabelRefRow): LabelRef => ({ id: row.id, name: row.name, color: row.color as LabelColor });

/** A task's labels in the order they are always shown: by name. */
export const sortLabels = (labels: LabelRef[]) =>
  [...labels].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));

/** A label as the pickers, filters and the management dialog list it. */
export type LabelSummary = LabelRef & {
  /** Null for a personal label, otherwise the team it belongs to. */
  team: { id: string; name: string } | null;
  /** May the current user rename, recolor or delete it. */
  canManage: boolean;
  /** How many tasks carry it. */
  taskCount: number;
};

const summarySelect = (userId: string) =>
  ({
    ...labelRefSelect,
    ownerId: true,
    team: {
      select: {
        id: true,
        name: true,
        // Limited to the current user, for their role.
        memberships: { where: { userId }, select: { role: true } },
      },
    },
    _count: { select: { tasks: true } },
  }) as const;

type SummaryRow = Prisma.LabelGetPayload<{ select: ReturnType<typeof summarySelect> }>;

function toSummary(row: SummaryRow, userId: string): LabelSummary {
  const role = row.team?.memberships[0]?.role;

  return {
    ...toLabelRef(row),
    team: row.team ? { id: row.team.id, name: row.team.name } : null,
    canManage: row.team ? role === TeamRole.OWNER || role === TeamRole.ADMIN : row.ownerId === userId,
    taskCount: row._count.tasks,
  };
}

const byName = [{ nameKey: "asc" as const }, { id: "asc" as const }];

/** Every label the user can use: their personal ones and those of each team they are in. */
export async function listLabelsForUser(userId: string): Promise<LabelSummary[]> {
  const rows = await prisma.label.findMany({ where: labelAccessWhere(userId), select: summarySelect(userId), orderBy: byName });

  return rows.map((row) => toSummary(row, userId));
}

/** A project if this user can access it, with what decides its workspace. */
const findProject = (userId: string, projectId: string) =>
  prisma.project.findFirst({
    where: { AND: [{ id: projectId }, projectAccessWhere(userId)] },
    select: { teamId: true, ownerId: true },
  });

/** The labels a task of this project can carry; null when the project doesn't exist or isn't accessible. */
export async function listLabelsForProject(userId: string, projectId: string): Promise<LabelSummary[] | null> {
  const project = await findProject(userId, projectId);
  const scope = project && scopeOfProject(project);

  if (!scope) return null;

  const rows = await prisma.label.findMany({
    // The access rule again, so a scope can only ever narrow what the user may see.
    where: { AND: [scopeWhere(scope), labelAccessWhere(userId)] },
    select: summarySelect(userId),
    orderBy: byName,
  });

  return rows.map((row) => toSummary(row, userId));
}

export type LabelError =
  | "label-not-found"
  | "label-workspace-not-found"
  | "label-forbidden"
  | "label-duplicate"
  | "label-limit"
  | "labels-too-many";

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** The workspace a new label goes into, if this user may add to it. */
async function resolveScope(userId: string, input: Pick<LabelInput, "teamId" | "projectId">): Promise<LabelScope | null> {
  if (input.projectId) {
    const project = await findProject(userId, input.projectId);

    return project ? scopeOfProject(project) : null;
  }

  if (input.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId } },
      select: { id: true },
    });

    return membership ? { ownerId: null, teamId: input.teamId } : null;
  }

  return { ownerId: userId, teamId: null };
}

/**
 * Creates a label in the user's personal workspace, in a team they belong to,
 * or in the workspace of a project they can access. "label-workspace-not-found"
 * is the same for a team or project that doesn't exist and one that isn't theirs.
 */
export async function createLabel(
  userId: string,
  input: LabelInput,
): Promise<{ label: LabelSummary } | { error: LabelError }> {
  const scope = await resolveScope(userId, input);

  if (!scope) return { error: "label-workspace-not-found" };

  if ((await prisma.label.count({ where: scopeWhere(scope) })) >= MAX_LABELS_PER_WORKSPACE) {
    return { error: "label-limit" };
  }

  try {
    const row = await prisma.label.create({
      data: { name: input.name, nameKey: labelNameKey(input.name), color: input.color, ...scope },
      select: summarySelect(userId),
    });

    return { label: toSummary(row, userId) };
  } catch (error) {
    // The unique (workspace, name) index: also what stops two simultaneous requests both creating it.
    if (isUniqueViolation(error)) return { error: "label-duplicate" };

    throw error;
  }
}

/** "label-not-found" for a label that doesn't exist or isn't visible; "label-forbidden" for one the user may use but not change. */
async function manageable(userId: string, labelId: string): Promise<LabelError | null> {
  if (labelId.length > 100) return "label-not-found";

  if ((await prisma.label.count({ where: { AND: [{ id: labelId }, labelManageWhere(userId)] } })) > 0) return null;

  return (await prisma.label.count({ where: { AND: [{ id: labelId }, labelAccessWhere(userId)] } })) > 0
    ? "label-forbidden"
    : "label-not-found";
}

export async function updateLabel(
  userId: string,
  labelId: string,
  input: LabelUpdate,
): Promise<{ label: LabelSummary } | { error: LabelError }> {
  const problem = await manageable(userId, labelId);
  if (problem) return { error: problem };

  try {
    // The permission is part of the statement, so it still holds at the moment of the write.
    const { count } = await prisma.label.updateMany({
      where: { AND: [{ id: labelId }, labelManageWhere(userId)] },
      data: {
        ...(input.name !== undefined ? { name: input.name, nameKey: labelNameKey(input.name) } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });

    if (count === 0) return { error: "label-not-found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "label-duplicate" };

    throw error;
  }

  const row = await prisma.label.findFirst({
    where: { AND: [{ id: labelId }, labelAccessWhere(userId)] },
    select: summarySelect(userId),
  });

  return row ? { label: toSummary(row, userId) } : { error: "label-not-found" };
}

/** Deletes a label; it comes off every task that carried it (the tasks themselves are untouched). */
export async function deleteLabel(userId: string, labelId: string): Promise<"deleted" | LabelError> {
  const problem = await manageable(userId, labelId);
  if (problem) return problem;

  const { count } = await prisma.label.deleteMany({ where: { AND: [{ id: labelId }, labelManageWhere(userId)] } });

  return count > 0 ? "deleted" : "label-not-found";
}

/* ------------------------------ Labels on tasks ------------------------------ */

/**
 * Serialises changes to one task's labels for the rest of the transaction, so
 * a label can't be added at the same moment the task moves to a workspace
 * where that label doesn't belong, and the per-task limit can't be passed by
 * two requests at once. Released when the transaction ends.
 */
export async function lockTaskLabels(tx: Prisma.TransactionClient, taskId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`labels:${taskId}`}))`;
}

/** True when every one of these labels exists in this workspace. */
export async function labelsInScope(
  db: Prisma.TransactionClient | typeof prisma,
  scope: LabelScope,
  labelIds: readonly string[],
) {
  if (labelIds.length === 0) return true;

  return (await db.label.count({ where: { AND: [{ id: { in: [...labelIds] } }, scopeWhere(scope)] } })) === labelIds.length;
}

/** Whether a label (as stored) belongs to a workspace. */
export const inScope = (label: { ownerId: string | null; teamId: string | null }, scope: LabelScope) =>
  scope.teamId ? label.teamId === scope.teamId : label.teamId === null && label.ownerId === scope.ownerId;

type TaskLabelError = "task-not-found" | LabelError;

const taskWithScope = (db: Prisma.TransactionClient | typeof prisma, userId: string, taskId: string) =>
  db.task.findFirst({
    where: { id: taskId, project: projectAccessWhere(userId) },
    select: { project: { select: { teamId: true, ownerId: true } }, labels: { select: { labelId: true } } },
  });

/** A task's labels, by name; null when the task doesn't exist or isn't accessible. */
export async function listTaskLabels(userId: string, taskId: string): Promise<LabelRef[] | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: projectAccessWhere(userId) },
    select: { labels: { select: { label: { select: labelRefSelect } } } },
  });

  return task ? sortLabels(task.labels.map(({ label }) => toLabelRef(label))) : null;
}

/**
 * Puts one label on a task. Adding one the task already has changes nothing
 * and records nothing. The label must belong to the workspace of the task's
 * project; any other label, and one that doesn't exist, is "label-not-found".
 */
export async function addTaskLabel(
  userId: string,
  taskId: string,
  labelId: string,
): Promise<{ labels: LabelRef[] } | { error: TaskLabelError }> {
  const outcome = await prisma.$transaction(async (tx): Promise<TaskLabelError | null> => {
    await lockTaskLabels(tx, taskId);

    const task = await taskWithScope(tx, userId, taskId);
    const scope = task && scopeOfProject(task.project);

    if (!task || !scope) return "task-not-found";
    if (!(await labelsInScope(tx, scope, [labelId]))) return "label-not-found";
    if (task.labels.some((link) => link.labelId === labelId)) return null;
    if (task.labels.length >= MAX_LABELS_PER_TASK) return "labels-too-many";

    await tx.taskLabel.create({ data: { taskId, labelId } });
    // Like any other recorded change, it moves the task's "Updated" date.
    await tx.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } });
    await tx.activity.create({ data: activityRow("TASK_LABELS_ADDED", taskId, userId, { labelIds: [labelId] }) });

    return null;
  });

  if (outcome) return { error: outcome };

  const labels = await listTaskLabels(userId, taskId);

  return labels ? { labels } : { error: "task-not-found" };
}

/** Takes one label off a task. "label-not-found" when the task doesn't carry it. */
export async function removeTaskLabel(
  userId: string,
  taskId: string,
  labelId: string,
): Promise<{ labels: LabelRef[] } | { error: TaskLabelError }> {
  const outcome = await prisma.$transaction(async (tx): Promise<TaskLabelError | null> => {
    await lockTaskLabels(tx, taskId);

    if (!(await taskWithScope(tx, userId, taskId))) return "task-not-found";

    const { count } = await tx.taskLabel.deleteMany({ where: { taskId, labelId } });

    if (count === 0) return "label-not-found";

    await tx.task.update({ where: { id: taskId }, data: { updatedAt: new Date() } });
    await tx.activity.create({ data: activityRow("TASK_LABELS_REMOVED", taskId, userId, { labelIds: [labelId] }) });

    return null;
  });

  if (outcome) return { error: outcome };

  const labels = await listTaskLabels(userId, taskId);

  return labels ? { labels } : { error: "task-not-found" };
}

/**
 * Makes a task's labels exactly `labelIds`, inside the transaction that saves
 * the task (which holds lockTaskLabels). Anything left on the task that isn't
 * of `scope` is removed too: the last guard against a label from another workspace.
 */
export async function writeTaskLabels(
  tx: Prisma.TransactionClient,
  taskId: string,
  scope: LabelScope,
  added: readonly string[],
  removed: readonly string[],
) {
  if (removed.length > 0) {
    await tx.taskLabel.deleteMany({ where: { taskId, labelId: { in: [...removed] } } });
  }

  if (added.length > 0) {
    await tx.taskLabel.createMany({ data: added.map((labelId) => ({ taskId, labelId })), skipDuplicates: true });
  }

  // Compared row by row rather than with a NOT in SQL: a personal label's teamId is NULL, and
  // "NOT (NULL = team)" is not true in SQL, so such a filter would quietly leave it in place.
  const links = await tx.taskLabel.findMany({
    where: { taskId },
    select: { labelId: true, label: { select: { ownerId: true, teamId: true } } },
  });
  const foreign = links.filter((link) => !inScope(link.label, scope)).map((link) => link.labelId);

  if (foreign.length > 0) {
    await tx.taskLabel.deleteMany({ where: { taskId, labelId: { in: foreign } } });
  }
}

/** A repeating task's next occurrence carries the same labels as the one just completed. */
export async function copyLabelsToOccurrence(tx: Prisma.TransactionClient, fromTaskId: string, toTaskId: string) {
  const links = await tx.taskLabel.findMany({ where: { taskId: fromTaskId }, select: { labelId: true } });

  if (links.length > 0) {
    await tx.taskLabel.createMany({ data: links.map(({ labelId }) => ({ taskId: toTaskId, labelId })), skipDuplicates: true });
  }
}

/** A place a label can be created in: the user's personal labels (teamId null) or one of their teams. */
export type LabelWorkspace = { teamId: string | null; name: string };

/** The user's workspaces, personal first, then their teams by name. */
export async function listLabelWorkspaces(userId: string): Promise<LabelWorkspace[]> {
  const teams = await prisma.team.findMany({
    where: { memberships: { some: { userId } } },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return [{ teamId: null, name: "Personal" }, ...teams.map((team) => ({ teamId: team.id, name: team.name }))];
}
