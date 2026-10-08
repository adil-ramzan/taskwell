import "server-only";

import type { ActivityType, Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { decodeCursor, newestFirst, olderThan, PAGE_SIZE, toPage } from "@/lib/pagination";
import type { LabelColor, LabelRef } from "@/lib/label-rules";
import { labelAccessWhere } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { RECURRENCE_FREQUENCIES, type RecurrenceFrequency, type RecurrenceRule } from "@/lib/recurrence-rules";
import type { TaskPriorityValue, TaskStatusValue } from "@/lib/task-validation";

/*
 * Activity is only ever written on the server, by the data layer, in the same
 * transaction as the change it records, with the actor taken from the session.
 * There is no API that accepts an activity. Metadata holds IDs and enum values
 * only (never comment text, names, tokens or other secrets); names are looked
 * up when the history is read.
 */
type ActivityMetadata = {
  TASK_CREATED: undefined;
  TASK_UPDATED: { fields: ("title" | "description")[] };
  TASK_STATUS_CHANGED: { from: TaskStatusValue; to: TaskStatusValue };
  TASK_PRIORITY_CHANGED: { from: TaskPriorityValue; to: TaskPriorityValue };
  TASK_PROJECT_CHANGED: { fromProjectId: string; toProjectId: string };
  TASK_ASSIGNEE_CHANGED: { fromUserId: string | null; toUserId: string | null };
  /** ISO instants; null = no due date. */
  TASK_DUE_DATE_CHANGED: { from: string | null; to: string | null };
  /** Recorded on the parent. `deleted`: the subtask was deleted, not just detached. */
  SUBTASK_ADDED: { subtaskId: string };
  SUBTASK_REMOVED: { subtaskId: string; deleted?: true };
  /** Recorded on both tasks. `deleted`: the other task was deleted, which removed the dependency. */
  DEPENDENCY_ADDED: { blockerTaskId: string; blockedTaskId: string };
  DEPENDENCY_REMOVED: { blockerTaskId: string; blockedTaskId: string; deleted?: true };
  /** The schedule as it was saved: enum values, numbers and calendar days. */
  RECURRENCE_CREATED: RecurrenceRule;
  RECURRENCE_UPDATED: RecurrenceRule;
  RECURRENCE_DISABLED: undefined;
  /** Recorded on both tasks: the completed occurrence and the one created to follow it. */
  RECURRENCE_GENERATED: { fromTaskId: string; toTaskId: string };
  /** One record per request, however many labels it added or removed. */
  TASK_LABELS_ADDED: { labelIds: string[] };
  TASK_LABELS_REMOVED: { labelIds: string[] };
  /** Time that was recorded: a timer stopped, or (`manual`) an entry typed in. Starting a timer records nothing. */
  TIME_ENTRY_ADDED: { entryId: string; seconds: number; manual?: true };
  TIME_ENTRY_UPDATED: { entryId: string; seconds: number };
  /** `authorId`: whose entry it was. */
  TIME_ENTRY_DELETED: { entryId: string; seconds: number; authorId: string };
  /** The file's name is looked up when the history is read; it is never stored here. */
  ATTACHMENT_ADDED: { attachmentId: string };
  /** `authorId`: who had uploaded it; null once that account is gone. */
  ATTACHMENT_DELETED: { attachmentId: string; authorId: string | null };
  COMMENT_ADDED: { commentId: string };
  COMMENT_UPDATED: { commentId: string };
  COMMENT_DELETED: { commentId: string; authorId: string };
};

/** A row for `activity.create` / `createMany`; the type parameter keeps metadata in the right shape. */
export function activityRow<T extends ActivityType>(
  type: T,
  taskId: string,
  actorId: string,
  ...[metadata]: ActivityMetadata[T] extends undefined ? [] : [ActivityMetadata[T]]
): Prisma.ActivityCreateManyInput {
  return { type, taskId, actorId, metadata: metadata as Prisma.InputJsonValue | undefined };
}

/** Serializable shape for the task page: names resolved, nothing but what the UI shows. */
export type ActivitySummary = {
  id: string;
  type: ActivityType;
  createdAt: string;
  /** Null when the account that did it has since been deleted. */
  actor: { name: string; email: string; avatar: AvatarRef | null } | null;
  /** Status or priority values, for the *_CHANGED types. */
  from?: string;
  to?: string;
  /** Names for an assignee change; null = nobody, undefined = that account no longer exists. */
  fromUser?: string | null;
  toUser?: string | null;
  /** ISO instants for a due-date change; null = no due date. */
  fromDue?: string | null;
  toDue?: string | null;
  /** Destination project of a move; undefined when the viewer can't access it any more. */
  project?: string;
  /** What a TASK_UPDATED changed. */
  fields?: string[];
  /**
   * The other task of a subtask or dependency event. Null when it no longer
   * exists or the viewer can't access it, so nothing about it is shown.
   */
  task?: { id: string; title: string } | null;
  /** For a dependency event: what the other task is to this one. */
  relation?: "blocked-by" | "blocks";
  /** The subtask or dependency went away because a task was deleted. */
  deleted?: boolean;
  /** The repeat schedule a RECURRENCE_CREATED / RECURRENCE_UPDATED saved. */
  rule?: Pick<RecurrenceRule, "frequency" | "interval" | "weekdays" | "monthDay">;
  /** For RECURRENCE_GENERATED: whether this task is the one that was created ("this") or the one it follows ("next"). */
  generated?: "this" | "next";
  /** The labels a TASK_LABELS_* event is about that still exist and the viewer can see. */
  labels?: LabelRef[];
  /** How many more it was about that have since been deleted (or are out of the viewer's reach). */
  missingLabels?: number;
  /** Whose comment was deleted, when it wasn't the actor's own. */
  commentAuthor?: string;
  /** The name of the file an ATTACHMENT_ADDED is about; undefined once the file has been removed. */
  fileName?: string;
  /** Whose file was deleted, when it wasn't the actor's own. */
  fileUploader?: string;
  /** The length of the time entry a TIME_ENTRY_* event is about. */
  seconds?: number;
  /** A TIME_ENTRY_ADDED that was typed in rather than timed. */
  manual?: boolean;
  /** Whose time entry was deleted, when it wasn't the actor's own. */
  entryUser?: string;
};

const asRecord = (value: Prisma.JsonValue | null): Prisma.JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

export type ActivityPage = {
  /** One page (up to 50), newest first. */
  activities: ActivitySummary[];
  /** Pass as `before` to get the next older page; null when there is nothing older. */
  nextCursor: string | null;
};

/**
 * A page of a task's activity, newest first: the latest 50, or the 50 before
 * `before`. The task access filter is part of the query on every call, so a
 * task the user can't access yields an empty page whatever the cursor. Four
 * queries at most, however many rows: the activity, then the names of the
 * users, projects and tasks its metadata refers to.
 */
export async function listTaskActivity(
  userId: string,
  taskId: string,
  before?: string,
): Promise<ActivityPage | { error: "invalid-cursor" }> {
  const cursor = before === undefined ? undefined : decodeCursor(before);
  if (cursor === null) return { error: "invalid-cursor" };

  const fetched = await prisma.activity.findMany({
    where: { taskId, task: { project: projectAccessWhere(userId) }, ...olderThan(cursor) },
    select: {
      id: true,
      type: true,
      metadata: true,
      createdAt: true,
      actorId: true,
      actor: { select: { name: true, email: true, ...avatarSelect } },
    },
    orderBy: newestFirst,
    take: PAGE_SIZE + 1,
  });
  const { page: rows, nextCursor } = toPage(fetched);

  const userIds = new Set<string>();
  const projectIds = new Set<string>();
  const taskIds = new Set<string>();
  const labelIds = new Set<string>();
  const attachmentIds = new Set<string>();
  const labelIdsOf = (metadata: Prisma.JsonObject) =>
    Array.isArray(metadata.labelIds) ? metadata.labelIds.filter((id): id is string => typeof id === "string") : [];
  // The other task of a subtask or dependency event, seen from the task whose history this is.
  const otherTaskId = (metadata: Prisma.JsonObject) =>
    asString(metadata.subtaskId) ??
    (metadata.blockerTaskId === taskId ? asString(metadata.blockedTaskId) : asString(metadata.blockerTaskId));

  for (const row of rows) {
    const metadata = asRecord(row.metadata);

    for (const key of ["fromUserId", "toUserId", "authorId"]) {
      const id = asString(metadata[key]);
      if (id) userIds.add(id);
    }

    const projectId = asString(metadata.toProjectId);
    if (projectId) projectIds.add(projectId);

    const otherId = otherTaskId(metadata);
    if (otherId) taskIds.add(otherId);

    for (const id of labelIdsOf(metadata)) labelIds.add(id);

    if (row.type === "ATTACHMENT_ADDED") {
      const attachmentId = asString(metadata.attachmentId);
      if (attachmentId) attachmentIds.add(attachmentId);
    }
  }

  const [users, projects, tasks, labels, files] = await Promise.all([
    userIds.size > 0
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : [],
    // Only projects this user can access, so a history never reveals another project's name.
    projectIds.size > 0
      ? prisma.project.findMany({
          where: { AND: [{ id: { in: [...projectIds] } }, projectAccessWhere(userId)] },
          select: { id: true, name: true },
        })
      : [],
    // Likewise only tasks this user can access; a deleted or moved-away task has no title here.
    taskIds.size > 0
      ? prisma.task.findMany({
          where: { id: { in: [...taskIds] }, project: projectAccessWhere(userId) },
          select: { id: true, title: true },
        })
      : [],
    // And only labels this user can see: their own, and those of their teams.
    labelIds.size > 0
      ? prisma.label.findMany({
          where: { AND: [{ id: { in: [...labelIds] } }, labelAccessWhere(userId)] },
          select: { id: true, name: true, color: true },
        })
      : [],
    // Only files still on this task (which the access check above covers).
    attachmentIds.size > 0
      ? prisma.taskAttachment.findMany({ where: { id: { in: [...attachmentIds] }, taskId }, select: { id: true, name: true } })
      : [],
  ]);
  const fileNames = new Map(files.map((file) => [file.id, file.name]));
  const labelsById = new Map(labels.map((label) => [label.id, { ...label, color: label.color as LabelColor }]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const userName = (value: unknown) => (value === null ? null : userNames.get(asString(value) ?? ""));

  const activities = rows.map((row) => {
    const metadata = asRecord(row.metadata);
    const summary: ActivitySummary = {
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor ? { name: row.actor.name, email: row.actor.email, avatar: toAvatarRef(row.actor) } : null,
    };

    switch (row.type) {
      case "TASK_STATUS_CHANGED":
      case "TASK_PRIORITY_CHANGED":
        summary.from = asString(metadata.from);
        summary.to = asString(metadata.to);
        break;
      case "TASK_ASSIGNEE_CHANGED":
        summary.fromUser = userName(metadata.fromUserId);
        summary.toUser = userName(metadata.toUserId);
        break;
      case "TASK_DUE_DATE_CHANGED":
        summary.fromDue = asString(metadata.from) ?? null;
        summary.toDue = asString(metadata.to) ?? null;
        break;
      case "TASK_PROJECT_CHANGED":
        summary.project = projectNames.get(asString(metadata.toProjectId) ?? "");
        break;
      case "TASK_UPDATED":
        summary.fields = Array.isArray(metadata.fields) ? metadata.fields.filter((f) => typeof f === "string") : [];
        break;
      case "SUBTASK_ADDED":
      case "SUBTASK_REMOVED":
      case "DEPENDENCY_ADDED":
      case "DEPENDENCY_REMOVED":
        summary.task = tasksById.get(otherTaskId(metadata) ?? "") ?? null;
        if (metadata.deleted === true) summary.deleted = true;
        if (row.type.startsWith("DEPENDENCY")) {
          summary.relation = metadata.blockedTaskId === taskId ? "blocked-by" : "blocks";
        }
        break;
      case "RECURRENCE_CREATED":
      case "RECURRENCE_UPDATED":
        if (RECURRENCE_FREQUENCIES.includes(metadata.frequency as RecurrenceFrequency)) {
          summary.rule = {
            frequency: metadata.frequency as RecurrenceFrequency,
            interval: typeof metadata.interval === "number" ? metadata.interval : 1,
            weekdays: Array.isArray(metadata.weekdays) ? metadata.weekdays.filter((day) => typeof day === "number") : [],
            monthDay: typeof metadata.monthDay === "number" ? metadata.monthDay : null,
          };
        }
        break;
      case "RECURRENCE_GENERATED":
        summary.generated = metadata.toTaskId === taskId ? "this" : "next";
        break;
      case "TASK_LABELS_ADDED":
      case "TASK_LABELS_REMOVED": {
        const ids = labelIdsOf(metadata);

        summary.labels = ids.flatMap((id) => labelsById.get(id) ?? []);
        summary.missingLabels = ids.length - summary.labels.length;
        break;
      }
      case "TIME_ENTRY_ADDED":
      case "TIME_ENTRY_UPDATED":
      case "TIME_ENTRY_DELETED":
        summary.seconds = typeof metadata.seconds === "number" ? metadata.seconds : 0;
        if (metadata.manual === true) summary.manual = true;
        if (row.type === "TIME_ENTRY_DELETED" && metadata.authorId !== row.actorId) {
          summary.entryUser = userNames.get(asString(metadata.authorId) ?? "") ?? "someone else";
        }
        break;
      case "ATTACHMENT_ADDED":
        summary.fileName = fileNames.get(asString(metadata.attachmentId) ?? "");
        break;
      case "ATTACHMENT_DELETED":
        if (metadata.authorId !== row.actorId) {
          summary.fileUploader = userNames.get(asString(metadata.authorId) ?? "") ?? "someone else";
        }
        break;
      case "COMMENT_DELETED":
        if (metadata.authorId !== row.actorId) {
          summary.commentAuthor = userNames.get(asString(metadata.authorId) ?? "") ?? "someone else";
        }
        break;
    }

    return summary;
  });

  return { activities, nextCursor };
}
