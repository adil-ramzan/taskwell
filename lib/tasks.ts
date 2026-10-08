import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import { removeFilesWithoutRows, takeTaskAttachmentKeys } from "@/lib/attachments";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import type { LabelRef } from "@/lib/label-rules";
import {
  inScope,
  labelRefSelect,
  labelsInScope,
  lockTaskLabels,
  scopeOfProject,
  sortLabels,
  toLabelRef,
  writeTaskLabels,
  type LabelError,
} from "@/lib/labels";
import { notificationRows } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  generateNextOccurrence,
  OccurrenceConflictError,
  planRecurrence,
  recurrenceSelect,
  toRecurrenceSummary,
  type RecurrenceError,
  type RecurrencePlan,
  type RecurrenceSummary,
} from "@/lib/recurrence";
import { dueTimeOf } from "@/lib/recurrence-rules";
import {
  reminderCreateRows,
  reminderSelect,
  reminderTimeZone,
  replaceReminders,
  rescheduleReminders,
  toReminderSummary,
  type ReminderError,
  type ReminderSummary,
} from "@/lib/reminders";
import {
  type TaskInput,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import { canAssignTasks } from "@/lib/team-validation";

/** Serializable shape passed from Server Components and API routes to the client. */
export type TaskSummary = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** ISO instant, or null when the task has no due date. */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** teamId is null for a personal project, whose tasks can't be assigned. */
  project: { id: string; name: string; teamId: string | null };
  assignee: { id: string; name: string; email: string; avatar: AvatarRef | null } | null;
  /** The task this one is a subtask of; null for a top-level task. Always in the same project. */
  parent: { id: string; title: string } | null;
  /** Counted from the task's subtasks as they are now; nothing is stored. Both 0 without subtasks. */
  subtasks: { total: number; completed: number };
  /** The repeat schedule (also when it is switched off); null for a task that has never been set to repeat. */
  recurrence: RecurrenceSummary | null;
  /** The task's labels, by name. Always labels of the task's own workspace (its team, or its personal owner). */
  labels: LabelRef[];
  /** The reader's own reminders on this task, soonest offset first. Nobody else's are ever included. */
  reminders: ReminderSummary[];
};

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true, teamId: true } },
  assignee: { select: { id: true, name: true, email: true, ...avatarSelect } },
  parentTask: { select: { id: true, title: true } },
  subtasks: { select: { status: true } },
  recurrence: { select: recurrenceSelect },
  labels: { select: { label: { select: labelRefSelect } } },
} as const;

/** What a task read selects for one reader: the task, and that reader's own reminders on it. */
const taskSelectFor = (userId: string) => ({
  ...taskSelect,
  reminders: { where: { userId }, select: reminderSelect, orderBy: { minutesBefore: "asc" as const } },
});

type TaskRow = Prisma.TaskGetPayload<{ select: ReturnType<typeof taskSelectFor> }>;

function toSummary(task: TaskRow): TaskSummary {
  const { assignee, parentTask, subtasks, recurrence, reminders, labels, ...rest } = task;

  return {
    ...rest,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email, avatar: toAvatarRef(assignee) }
      : null,
    parent: parentTask,
    subtasks: {
      total: subtasks.length,
      completed: subtasks.filter((subtask) => subtask.status === "COMPLETED").length,
    },
    recurrence: recurrence ? toRecurrenceSummary(recurrence, task.dueDate) : null,
    labels: sortLabels(labels.map(({ label }) => toLabelRef(label))),
    reminders: reminders.map(toReminderSummary),
  };
}

/*
 * Tasks have no owner column: access is always derived through the task's
 * project (see lib/access.ts): the owner of a personal project, or a member of
 * a team project's team. Every function takes the ID from the server-side
 * session and filters on it, so guessing another user's taskId or projectId
 * finds nothing. Being a task's assignee never grants access by itself.
 */
const ownedBy = (ownerId: string) => ({ project: projectAccessWhere(ownerId) });

/** The project if this user can access it, with the team that decides who can be assigned. */
export async function findAccessibleProject(ownerId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { AND: [{ id: projectId }, projectAccessWhere(ownerId)] },
    // ownerId: with teamId, what decides the project's label workspace.
    select: { id: true, teamId: true, ownerId: true },
  });
}

async function isTeamMember(teamId: string, userId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });

  return membership;
}

type AssignmentError = "assign-forbidden" | "invalid-assignee";

/**
 * Serialises changes to a project's task relationships (subtasks, dependencies,
 * moves) for the rest of the transaction, so two requests can't each pass a
 * check that the other one's write makes untrue (a cycle, a nested subtask, a
 * relationship across projects). The lock is released when the transaction ends.
 */
export async function lockProjectRelations(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`;
}

/**
 * Why a task can't be given this parent. "parent-not-found" is the same for a
 * task that doesn't exist and one this user can't access.
 */
type ParentError = "parent-not-found" | "self-parent" | "nested-subtask" | "parent-other-project" | "has-subtasks";

/** Why a task can't change project: its relationships all live inside one project. */
type MoveError = "move-subtask" | "move-has-subtasks" | "move-has-dependencies";

/**
 * The one place that decides whether a task of `projectId` may hang under
 * `parentTaskId`: the parent must be accessible, in that same project, and a
 * top-level task itself (one level of nesting only).
 */
async function checkParent(ownerId: string, parentTaskId: string, projectId: string): Promise<ParentError | null> {
  const parent = await prisma.task.findFirst({
    where: { id: parentTaskId, ...ownedBy(ownerId) },
    select: { projectId: true, parentTaskId: true },
  });

  if (!parent) return "parent-not-found";
  if (parent.parentTaskId !== null) return "nested-subtask";

  return parent.projectId === projectId ? null : "parent-other-project";
}

/** A task that turned out not to be deletable inside its delete transaction; everything done there is rolled back. */
class TaskNotDeleted extends Error {}

/** A label chosen for a task was deleted between the check and the write; the whole change is rolled back. */
class LabelGoneError extends Error {}

/** A repeating task can't hang under a parent: only top-level tasks repeat (see lib/recurrence.ts). */
type RepeatError = RecurrenceError | "recurring-subtask";

/** The saver's time zone from Settings, which a repeat schedule is read in; null when none is saved. */
export async function accountTimeZone(userId: string) {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } }))?.timeZone ?? null;
}

/** Still a top-level task of that project; asked again under the lock, just before the write. */
const isValidParent = async (tx: Prisma.TransactionClient, parentTaskId: string, projectId: string) =>
  (await tx.task.count({ where: { id: parentTaskId, projectId, parentTaskId: null } })) > 0;

/**
 * The one place that decides whether `userId` may set a task's assignee.
 * The team always comes from the task's project on the server, never from the
 * request. Changing the assignee (to someone or to nobody) needs the owner or
 * admin role in that team; the assignee must be a member of that same team.
 * "invalid-assignee" is the same for a user who doesn't exist, isn't in the
 * team, or a personal project, so user IDs can't be probed.
 */
export async function checkAssignment(
  userId: string,
  teamId: string | null,
  assigneeId: string | null,
): Promise<AssignmentError | null> {
  if (!teamId) {
    return assigneeId === null ? null : "invalid-assignee";
  }

  const actor = await isTeamMember(teamId, userId);

  if (!actor || !canAssignTasks(actor.role)) {
    return "assign-forbidden";
  }

  if (assigneeId !== null && !(await isTeamMember(teamId, assigneeId))) {
    return "invalid-assignee";
  }

  return null;
}

export async function listTasksForOwner(ownerId: string) {
  const tasks = await prisma.task.findMany({
    where: ownedBy(ownerId),
    select: taskSelectFor(ownerId),
    orderBy: { updatedAt: "desc" },
  });

  return tasks.map(toSummary);
}

/** Tasks assigned to this user, limited to projects they can still access. */
export async function listAssignedTasksForUser(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId, ...ownedBy(userId) },
    select: taskSelectFor(userId),
    orderBy: { updatedAt: "desc" },
  });

  return tasks.map(toSummary);
}

/** Returns an empty list when the project doesn't exist or belongs to someone else. */
export async function listTasksForProject(ownerId: string, projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, ...ownedBy(ownerId) },
    select: taskSelectFor(ownerId),
    orderBy: { updatedAt: "desc" },
  });

  return tasks.map(toSummary);
}

/**
 * A task's subtasks, oldest first. Empty when the task doesn't exist, isn't
 * accessible, or has none; subtasks share the parent's project, so the same
 * access rule covers them.
 */
export async function listSubtasks(ownerId: string, parentTaskId: string) {
  const tasks = await prisma.task.findMany({
    where: { parentTaskId, ...ownedBy(ownerId) },
    select: taskSelectFor(ownerId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return tasks.map(toSummary);
}

export async function getTaskById(ownerId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...ownedBy(ownerId) },
    select: taskSelectFor(ownerId),
  });

  return task ? toSummary(task) : null;
}

/**
 * "project-not-found" also covers a project that isn't accessible to this user.
 * With input.parentTaskId the new task is a subtask of that task (see checkParent).
 * `subtaskTitles` (a task created from a template) are created under the new
 * task, in that order and in the same transaction: all of it exists, or none.
 */
export async function createTask(
  ownerId: string,
  input: TaskInput,
  { subtaskTitles = [] }: { subtaskTitles?: readonly string[] } = {},
): Promise<{ task: TaskSummary } | { error: "project-not-found" | AssignmentError | ParentError | RecurrenceError | ReminderError | LabelError }> {
  const { recurrence: repeat, reminders: offsets = [], timeZone: sentZone, labelIds = [], ...fields } = input;
  const now = new Date();
  const project = await findAccessibleProject(ownerId, input.projectId);

  if (!project) {
    return { error: "project-not-found" };
  }

  // A new task is unassigned unless an owner or admin picked a team member.
  const assigneeId = input.assigneeId ?? null;
  let dueDate = input.dueDate ?? null;

  if (assigneeId !== null) {
    const problem = await checkAssignment(ownerId, project.teamId, assigneeId);
    if (problem) return { error: problem };
  }

  const parentTaskId = input.parentTaskId ?? null;

  if (parentTaskId !== null) {
    const problem = await checkParent(ownerId, parentTaskId, project.id);
    if (problem) return { error: problem };
  }

  let plan: RecurrencePlan | null = null;

  if (repeat) {
    if (parentTaskId !== null) return { error: "recurrence-subtask" };
    // Completing is what creates the next occurrence, so a task can't start out both.
    if (input.status === "COMPLETED") return { error: "recurrence-completed" };

    const planned = planRecurrence(repeat, null, dueDate, (await accountTimeZone(ownerId)) ?? sentZone ?? null, now);
    if ("error" in planned) return planned;

    plan = planned;
    // Without a due date of its own, a repeating task is due on its schedule's first day.
    dueDate = plan.dueDate ?? dueDate;
  }

  // Labels must be of the project's own workspace; any other, like one that doesn't exist, is not found.
  if (labelIds.length > 0) {
    const scope = scopeOfProject(project);

    if (!scope || !(await labelsInScope(prisma, scope, labelIds))) return { error: "label-not-found" };
  }

  // The creator's own reminders. They need something to count back from.
  let reminderZone: string | null = null;

  if (offsets.length > 0) {
    if (input.status === "COMPLETED") return { error: "reminder-completed" };
    if (!dueDate) return { error: "reminder-no-due-date" };
    if (new Date(dueDate).getTime() <= now.getTime()) return { error: "reminder-past-due" };

    reminderZone = await reminderTimeZone(ownerId, sentZone);
  }

  // The task and its first activity are written together (nested create = one transaction).
  // A due date given here is part of the creation, not a change: only updateTask records TASK_DUE_DATE_CHANGED.
  const create = (tx: Prisma.TransactionClient) => tx.task.create({
    data: {
      ...fields,
      parentTaskId,
      assigneeId,
      dueDate,
      activities: {
        create: [
          { type: "TASK_CREATED", actorId: ownerId },
          ...(assigneeId
            ? [{ type: "TASK_ASSIGNEE_CHANGED" as const, actorId: ownerId, metadata: { fromUserId: null, toUserId: assigneeId } }]
            : []),
          ...(plan ? [{ type: "RECURRENCE_CREATED" as const, actorId: ownerId, metadata: plan.rule }] : []),
        ],
      },
      ...(plan ? { recurrence: { create: plan.data } } : {}),
      ...(offsets.length > 0 ? { reminders: { create: reminderCreateRows(ownerId, offsets, dueDate, reminderZone, now) } } : {}),
      // Part of the creation, like the due date: no separate history record.
      ...(labelIds.length > 0 ? { labels: { create: labelIds.map((labelId) => ({ labelId })) } } : {}),
      // Tells the assignee, unless they assigned it to themselves. checkAssignment
      // has just confirmed they are a member of the project's team.
      notifications: {
        create:
          assigneeId && assigneeId !== ownerId
            ? [{ type: "TASK_ASSIGNED" as const, recipientId: assigneeId, actorId: ownerId }]
            : [],
      },
    },
    select: taskSelectFor(ownerId),
  });

  if (parentTaskId === null && subtaskTitles.length === 0) {
    return { task: toSummary(await create(prisma)) };
  }

  if (parentTaskId === null) {
    // Each subtask is an ordinary new task of the same project with its own history, and is recorded
    // on the new parent like one added by hand. Rows written in one transaction would share a
    // creation time, so each gets its own, a millisecond apart: subtasks are listed oldest first.
    const parentId = await prisma.$transaction(async (tx) => {
      const parent = await create(tx);
      const at = Date.now();
      const subtasks = subtaskTitles.map((title, index) => ({ id: randomUUID(), title, createdAt: new Date(at + index) }));

      await tx.task.createMany({
        data: subtasks.map((subtask) => ({ ...subtask, projectId: project.id, parentTaskId: parent.id })),
      });
      await tx.activity.createMany({
        data: subtasks.flatMap((subtask) => [
          { ...activityRow("TASK_CREATED", subtask.id, ownerId), createdAt: subtask.createdAt },
          { ...activityRow("SUBTASK_ADDED", parent.id, ownerId, { subtaskId: subtask.id }), createdAt: subtask.createdAt },
        ]),
      });

      return parent.id;
    });
    // Read back so the subtask count is the one just written.
    const task = await getTaskById(ownerId, parentId);

    return task ? { task } : { error: "project-not-found" };
  }

  // A subtask also goes into its parent's history, and the parent is checked once more under the lock.
  const task = await prisma.$transaction(async (tx) => {
    await lockProjectRelations(tx, project.id);

    if (!(await isValidParent(tx, parentTaskId, project.id))) return null;

    const created = await create(tx);

    await tx.activity.create({ data: activityRow("SUBTASK_ADDED", parentTaskId, ownerId, { subtaskId: created.id }) });

    return created;
  });

  return task ? { task: toSummary(task) } : { error: "parent-not-found" };
}

export async function updateTask(
  ownerId: string,
  taskId: string,
  input: Partial<TaskInput>,
): Promise<
  | { task: TaskSummary }
  | { error: "task-not-found" | "project-not-found" | AssignmentError | ParentError | MoveError | RepeatError | ReminderError | LabelError }
> {
  // The schedule and the reminders live in their own tables; everything else in `data` is a column of the task.
  const { recurrence: repeat, reminders: offsets, timeZone: sentZone, labelIds, ...data } = input;
  const current = await prisma.task.findFirst({
    where: { id: taskId, ...ownedBy(ownerId) },
    select: {
      title: true,
      description: true,
      status: true,
      priority: true,
      projectId: true,
      assigneeId: true,
      dueDate: true,
      parentTaskId: true,
      project: { select: { teamId: true, ownerId: true } },
      labels: { select: { labelId: true, label: { select: { ownerId: true, teamId: true } } } },
      recurrence: { select: recurrenceSelect },
      // Only the requester's own reminders are ever read or replaced here.
      reminders: { where: { userId: ownerId }, select: { minutesBefore: true } },
      _count: { select: { subtasks: true, blockedBy: true, blocking: true } },
    },
  });

  if (!current) {
    return { error: "task-not-found" };
  }

  const now = new Date();

  const parentTaskId = data.parentTaskId !== undefined ? data.parentTaskId : current.parentTaskId;
  const reparenting = parentTaskId !== current.parentTaskId;

  // The team that decides who can be assigned is the one of the project the task ends up in.
  let teamId = current.project.teamId;
  // Likewise the workspace that decides which labels the task may carry.
  let labelScope = scopeOfProject(current.project);
  const moving = data.projectId !== undefined && data.projectId !== current.projectId;

  if (moving) {
    const target = await findAccessibleProject(ownerId, data.projectId!);

    if (!target) {
      return { error: "project-not-found" };
    }

    teamId = target.teamId;
    labelScope = scopeOfProject(target);

    // Subtasks and dependencies never cross projects, so a task that has any stays where it is
    // until they are removed. Nothing is detached or deleted on the user's behalf.
    if (parentTaskId !== null) return { error: "move-subtask" };
    if (current._count.subtasks > 0) return { error: "move-has-subtasks" };
    if (current._count.blockedBy + current._count.blocking > 0) return { error: "move-has-dependencies" };
  }

  if (reparenting && parentTaskId !== null) {
    if (parentTaskId === taskId) return { error: "self-parent" };
    // A task with subtasks of its own would make them a second level.
    if (current._count.subtasks > 0) return { error: "has-subtasks" };

    const problem = await checkParent(ownerId, parentTaskId, data.projectId ?? current.projectId);
    if (problem) return { error: problem };
  }

  const update: Omit<Partial<TaskInput>, "recurrence" | "reminders" | "timeZone" | "labelIds"> = { ...data };

  // The task's labels after this request: the given set, or the ones it has that still belong where
  // it ends up. A move to another workspace drops the rest, as a move drops an assignee from another team.
  const heldLabels = current.labels.map((link) => link.labelId);
  const keptLabels = current.labels.filter((link) => labelScope && inScope(link.label, labelScope)).map((link) => link.labelId);
  const wantedLabels = labelIds ?? keptLabels;
  const addedLabels = wantedLabels.filter((id) => !heldLabels.includes(id));
  const removedLabels = heldLabels.filter((id) => !wantedLabels.includes(id));

  if (labelIds !== undefined && (!labelScope || !(await labelsInScope(prisma, labelScope, labelIds)))) {
    return { error: "label-not-found" };
  }


  // What happens to the repeat schedule: saved (a plan), switched off, or left alone.
  let plan: RecurrencePlan | null = null;
  const disabling = repeat === null && current.recurrence?.active === true;
  // Whether the task repeats once this request is done.
  const repeating = repeat ? true : repeat === null ? false : current.recurrence?.active === true;

  if (repeating && parentTaskId !== null) {
    // Saving a schedule on a subtask, or putting a repeating task under a parent.
    return { error: repeat ? "recurrence-subtask" : "recurring-subtask" };
  }

  if (repeat) {
    // Completing is what creates the next occurrence, so a task that is already completed can't start repeating.
    if (current.status === "COMPLETED" && (data.status ?? current.status) === "COMPLETED") {
      return { error: "recurrence-completed" };
    }

    const dueDate = data.dueDate !== undefined ? data.dueDate : (current.dueDate?.toISOString() ?? null);
    const planned = planRecurrence(repeat, current.recurrence, dueDate, (await accountTimeZone(ownerId)) ?? sentZone ?? null, now);
    if ("error" in planned) return planned;

    plan = planned.changed ? planned : null;
    // Without a due date of its own, a repeating task is due on its schedule's first day.
    if (planned.dueDate) update.dueDate = planned.dueDate;
  }

  // The requester's own reminders, replaced as a set. Asking for one they don't have yet needs a task
  // that can still remind: not completed, with a due date that hasn't passed (after this very change).
  const held = current.reminders.map((reminder) => reminder.minutesBefore);
  const remindersChanged =
    offsets !== undefined && (offsets.length !== held.length || offsets.some((offset) => !held.includes(offset)));
  const dueAfter = update.dueDate !== undefined ? (update.dueDate ? new Date(update.dueDate) : null) : current.dueDate;
  let reminderZone: string | null = null;

  if (remindersChanged && offsets.some((offset) => !held.includes(offset))) {
    if ((data.status ?? current.status) === "COMPLETED") return { error: "reminder-completed" };
    if (!dueAfter) return { error: "reminder-no-due-date" };
    if (dueAfter.getTime() <= now.getTime()) return { error: "reminder-past-due" };

    reminderZone = await reminderTimeZone(ownerId, sentZone);
  }

  if (data.assigneeId !== undefined && (moving || data.assigneeId !== current.assigneeId)) {
    // An explicit change of assignee (including to nobody) needs permission.
    const problem = await checkAssignment(ownerId, teamId, data.assigneeId);
    if (problem) return { error: problem };
  } else if (moving && current.assigneeId !== null) {
    // Moved without choosing an assignee: keep the current one only if they are
    // in the new project's team, so no assignment ever crosses teams.
    const stillValid = teamId !== null && (await isTeamMember(teamId, current.assigneeId)) !== null;
    update.assigneeId = stillValid ? current.assigneeId : null;
  }

  // One activity per kind of change that actually happens; unchanged fields record nothing.
  const activities: Prisma.ActivityCreateManyInput[] = [];
  // Both sides of the due date are canonical ISO strings (see validateDueDate), so the same instant is never a change.
  const before = { ...current, dueDate: current.dueDate?.toISOString() ?? null };
  const changed = <K extends keyof typeof update>(key: K) => update[key] !== undefined && update[key] !== before[key];
  const fields = (["title", "description"] as const).filter(changed);

  if (fields.length > 0) {
    activities.push(activityRow("TASK_UPDATED", taskId, ownerId, { fields }));
  }

  if (changed("status")) {
    activities.push(activityRow("TASK_STATUS_CHANGED", taskId, ownerId, { from: current.status, to: update.status! }));
  }

  if (changed("priority")) {
    activities.push(
      activityRow("TASK_PRIORITY_CHANGED", taskId, ownerId, { from: current.priority, to: update.priority! }),
    );
  }

  if (changed("projectId")) {
    activities.push(
      activityRow("TASK_PROJECT_CHANGED", taskId, ownerId, {
        fromProjectId: current.projectId,
        toProjectId: update.projectId!,
      }),
    );
  }

  if (changed("assigneeId")) {
    activities.push(
      activityRow("TASK_ASSIGNEE_CHANGED", taskId, ownerId, {
        fromUserId: current.assigneeId,
        toUserId: update.assigneeId ?? null,
      }),
    );
  }

  if (changed("dueDate")) {
    activities.push(
      activityRow("TASK_DUE_DATE_CHANGED", taskId, ownerId, { from: before.dueDate, to: update.dueDate ?? null }),
    );
  }

  if (addedLabels.length > 0) {
    activities.push(activityRow("TASK_LABELS_ADDED", taskId, ownerId, { labelIds: addedLabels }));
  }

  if (removedLabels.length > 0) {
    activities.push(activityRow("TASK_LABELS_REMOVED", taskId, ownerId, { labelIds: removedLabels }));
  }

  if (plan) {
    activities.push(
      activityRow(plan.kind === "created" ? "RECURRENCE_CREATED" : "RECURRENCE_UPDATED", taskId, ownerId, plan.rule),
    );
  } else if (disabling) {
    activities.push(activityRow("RECURRENCE_DISABLED", taskId, ownerId));
  }

  // A schedule repeats its task's time of day, so a new due time on the task is the schedule's new time.
  // (A saved plan has already taken it from the new due date.)
  const dueTime =
    !plan && current.recurrence && changed("dueDate") && update.dueDate
      ? dueTimeOf(update.dueDate, current.recurrence.timeZone)
      : undefined;
  const completing = changed("status") && update.status === "COMPLETED";

  // Becoming or ceasing to be a subtask is recorded on the parent, where the subtask list is.
  if (reparenting) {
    if (current.parentTaskId) {
      activities.push(activityRow("SUBTASK_REMOVED", current.parentTaskId, ownerId, { subtaskId: taskId }));
    }

    if (parentTaskId) {
      activities.push(activityRow("SUBTASK_ADDED", parentTaskId, ownerId, { subtaskId: taskId }));
    }
  }

  // Only a deliberate assignment to someone notifies them: not unassigning, and
  // not the automatic clearing above (there data.assigneeId is undefined).
  const notifications =
    changed("assigneeId") && data.assigneeId !== undefined
      ? notificationRows("TASK_ASSIGNED", [data.assigneeId], ownerId, { taskId })
      : [];

  // Reminders are personal and leave no trace in the task's history or its "Updated" date.
  if (activities.length > 0 || remindersChanged) {
    // The write, its history and any notification succeed or fail together. updateMany lets the
    // access filter and the write happen in one statement.
    const write = async (tx: Prisma.TransactionClient) => {
      // What was checked above must still hold when the row is written.
      const guard: Prisma.TaskWhereInput = {
        ...(moving ? { blockedBy: { none: {} }, blocking: { none: {} } } : {}),
        ...(moving || (reparenting && parentTaskId !== null) ? { subtasks: { none: {} } } : {}),
        // A subtask never repeats: not by gaining a parent (unless this request also turns repeating
        // off, which is written just below), and not by gaining a schedule.
        ...(reparenting && parentTaskId !== null && !disabling ? { NOT: { recurrence: { is: { active: true } } } } : {}),
        ...(plan && !reparenting ? { parentTaskId: null } : {}),
        // Nor does a task that another request has completed in the meantime: its schedule has moved on.
        ...(plan && current.status !== "COMPLETED" ? { status: { not: "COMPLETED" } } : {}),
      };

      // Before the task row is touched, so label changes and moves of this task queue up in one order.
      const labelsChange = addedLabels.length > 0 || removedLabels.length > 0;

      if (labelsChange || moving) await lockTaskLabels(tx, taskId);

      if (moving || reparenting) {
        await lockProjectRelations(tx, current.projectId);

        if (reparenting && parentTaskId !== null && !(await isValidParent(tx, parentTaskId, update.projectId ?? current.projectId))) {
          return false;
        }
      }

      // This also takes the task's row lock, which puts concurrent changes to its schedule in a queue.
      // A change to the schedule alone still counts as a change to the task ("Updated").
      const count =
        activities.length > 0
          ? (
              await tx.task.updateMany({
                where: { id: taskId, ...ownedBy(ownerId), ...guard },
                data: Object.keys(update).length > 0 ? update : { updatedAt: now },
              })
            ).count
          : // Only this person's reminders change: the task row is left alone, but access is checked here too.
            await tx.task.count({ where: { id: taskId, ...ownedBy(ownerId) } });

      if (count === 0) return false;

      if ((labelsChange || moving) && labelScope) {
        // The labels given must still exist in that workspace now (one may have been deleted meanwhile).
        if (!(await labelsInScope(tx, labelScope, addedLabels))) throw new LabelGoneError();

        await writeTaskLabels(tx, taskId, labelScope, addedLabels, removedLabels);
      }

      // Everyone's reminders follow the due date; then the requester's own set is brought up to date.
      if (changed("dueDate")) await rescheduleReminders(tx, taskId, dueAfter, now);
      if (remindersChanged) await replaceReminders(tx, ownerId, taskId, offsets ?? [], dueAfter, reminderZone, now);

      let recorded = activities;

      if (plan) {
        await tx.taskRecurrence.upsert({ where: { taskId }, create: { ...plan.data, taskId }, update: plan.data });
      } else if (disabling) {
        const switchedOff = await tx.taskRecurrence.updateMany({ where: { taskId, active: true }, data: { active: false } });

        // A completion in the same instant has already moved the schedule on: nothing was turned off here.
        if (switchedOff.count === 0) recorded = activities.filter((activity) => activity.type !== "RECURRENCE_DISABLED");
      } else if (dueTime !== undefined) {
        await tx.taskRecurrence.updateMany({ where: { taskId }, data: { dueTime } });
      }

      await tx.activity.createMany({ data: recorded });

      if (notifications.length > 0) {
        await tx.notification.createMany({ data: notifications });
      }

      // The one moment a repeating task's next occurrence is created (lib/recurrence.ts).
      if (completing) {
        await generateNextOccurrence(tx, taskId, ownerId, now);
      }

      return true;
    };

    let written: boolean;

    try {
      written = await prisma.$transaction(write);
    } catch (error) {
      // Another request completed this task in the same instant and created its next occurrence:
      // the schedule had moved on, or the unique Task.recurredFromId refused a second one. That
      // request did everything this one set out to do, so the task is simply read back below.
      if (error instanceof LabelGoneError) return { error: "label-not-found" };

      const duplicate =
        error instanceof OccurrenceConflictError ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");

      if (!completing || !duplicate) throw error;

      written = true;
    }

    if (!written) {
      // The guards above refuse a write that the checks before the transaction allowed, when the
      // task changed in between. For a schedule, the one case with its own answer is a completed task.
      const completedMeanwhile =
        plan !== null &&
        (await prisma.task.count({ where: { id: taskId, status: "COMPLETED", ...ownedBy(ownerId) } })) > 0;

      return { error: completedMeanwhile ? "recurrence-completed" : "task-not-found" };
    }
  }

  // Nothing to change means nothing is written, so "Updated" always matches the history.
  const task = await getTaskById(ownerId, taskId);

  return task ? { task } : { error: "task-not-found" };
}

/**
 * "not-found" when the task doesn't exist or belongs to someone else.
 * "has-subtasks": a parent is never deleted together with its subtasks, and they
 * are never left without it; they have to be deleted or detached first.
 * A subtask's deletion is recorded on its parent, and the end of a dependency
 * on the task at its other end (the dependency rows themselves go with the task).
 */
export async function deleteTask(ownerId: string, taskId: string): Promise<"deleted" | "not-found" | "has-subtasks"> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...ownedBy(ownerId) },
    select: {
      parentTaskId: true,
      _count: { select: { subtasks: true } },
      blockedBy: { select: { blockerTaskId: true } },
      blocking: { select: { blockedTaskId: true } },
    },
  });

  if (!task) return "not-found";
  if (task._count.subtasks > 0) return "has-subtasks";

  const activities = [
    ...(task.parentTaskId
      ? [activityRow("SUBTASK_REMOVED", task.parentTaskId, ownerId, { subtaskId: taskId, deleted: true })]
      : []),
    ...task.blockedBy.map(({ blockerTaskId }) =>
      activityRow("DEPENDENCY_REMOVED", blockerTaskId, ownerId, { blockerTaskId, blockedTaskId: taskId, deleted: true }),
    ),
    ...task.blocking.map(({ blockedTaskId }) =>
      activityRow("DEPENDENCY_REMOVED", blockedTaskId, ownerId, { blockerTaskId: taskId, blockedTaskId, deleted: true }),
    ),
  ];

  // Collected inside the transaction, under the lock uploads take; removed from disk once the task is really gone.
  let files: string[] = [];

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Access is checked again here, before anything of the task is touched.
      if ((await tx.task.count({ where: { id: taskId, ...ownedBy(ownerId), subtasks: { none: {} } } })) === 0) return "not-found";

      files = await takeTaskAttachmentKeys(tx, taskId);

      const { count } = await tx.task.deleteMany({
        where: { id: taskId, ...ownedBy(ownerId), subtasks: { none: {} } },
      });

      // Nothing was deleted after all: put the rows back by undoing the whole transaction.
      if (count === 0) throw new TaskNotDeleted();
      if (activities.length > 0) await tx.activity.createMany({ data: activities });

      return "deleted";
    });

    // A key whose row still exists (the transaction was rolled back) is left alone.
    if (outcome === "deleted") await removeFilesWithoutRows(files);

    return outcome;
  } catch (error) {
    if (error instanceof TaskNotDeleted) return "not-found";

    // A subtask added in the same instant: the parent foreign key refuses the delete.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return "has-subtasks";
    }

    throw error;
  }
}

/**
 * Assigned and completed task counts per user for one team's projects, in a
 * single grouped query. Empty when the user isn't a member of the team.
 */
export async function getTeamWorkload(userId: string, teamId: string) {
  const groups = await prisma.task.groupBy({
    by: ["assigneeId", "status"],
    where: { assigneeId: { not: null }, project: { AND: [{ teamId }, projectAccessWhere(userId)] } },
    _count: { _all: true },
  });
  const workload = new Map<string, { assigned: number; completed: number }>();

  for (const group of groups) {
    if (!group.assigneeId) continue;

    const entry = workload.get(group.assigneeId) ?? { assigned: 0, completed: 0 };
    entry.assigned += group._count._all;
    if (group.status === "COMPLETED") entry.completed += group._count._all;
    workload.set(group.assigneeId, entry);
  }

  return workload;
}
