import "server-only";

import { randomUUID } from "node:crypto";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { findMentions } from "@/lib/mentions";
import { notificationRows } from "@/lib/notifications";
import { decodeCursor, newestFirst, olderThan, PAGE_SIZE, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/team-validation";

/** Serializable shape passed from Server Components and API routes to the client. */
export type CommentSummary = {
  id: string;
  content: string;
  createdAt: string;
  edited: boolean;
  author: { name: string; email: string; avatar: AvatarRef | null };
  /** Only the author can edit a comment. */
  canEdit: boolean;
  /** The author, or an owner/admin of the task's team. */
  canDelete: boolean;
};

const commentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  author: { select: { name: true, email: true, ...avatarSelect } },
} as const;

type CommentRow = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  author: { name: string; email: string; avatarType: string; avatarKey: string | null };
};

function toSummary(comment: CommentRow, userId: string, canModerate: boolean): CommentSummary {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    // createComment writes both timestamps with the same value, so any difference is an edit.
    edited: comment.updatedAt.getTime() !== comment.createdAt.getTime(),
    author: { name: comment.author.name, email: comment.author.email, avatar: toAvatarRef(comment.author) },
    canEdit: comment.authorId === userId,
    canDelete: comment.authorId === userId || canModerate,
  };
}

/*
 * Comments use the task's access rule (lib/access.ts) and nothing else: whoever
 * can open the task can read and add comments. Every function takes the user ID
 * from the server-side session. A task the user can't access, and a comment
 * that isn't on that task, are both "not found", so IDs can't be probed.
 */

/** Null when the user can't access the task; otherwise whether they may moderate its comments. */
async function getCommentAccess(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: projectAccessWhere(userId) },
    select: {
      assigneeId: true,
      project: {
        select: {
          ownerId: true,
          teamId: true,
          team: { select: { memberships: { where: { userId }, select: { role: true } } } },
        },
      },
    },
  });

  if (!task) return null;

  const role = task.project.team?.memberships[0]?.role;

  return {
    // Moderation exists only in team tasks, for the team's owner and admins.
    canModerate: role !== undefined && canManageTeam(role),
    teamId: task.project.teamId,
    assigneeId: task.assigneeId,
    projectOwnerId: task.project.ownerId,
  };
}

type CommentAccess = NonNullable<Awaited<ReturnType<typeof getCommentAccess>>>;

/** Everyone who can open a team task: the members of its team. A personal task has no one but its owner. */
function listTaskAudience(teamId: string | null) {
  return teamId
    ? prisma.teamMember.findMany({ where: { teamId }, select: { userId: true, user: { select: { name: true } } } })
    : [];
}

/**
 * The names the comment box offers for "@" on this task: the other people who
 * can open it. Empty for a personal task, and for a task the user can't access.
 */
export async function listMentionableNames(userId: string, taskId: string) {
  const access = await getCommentAccess(userId, taskId);
  if (!access) return [];

  const audience = await listTaskAudience(access.teamId);

  return audience
    .filter((member) => member.userId !== userId)
    .map((member) => member.user.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Who a new comment notifies, decided entirely here from the task and the text.
 *
 * - Mention: every person named with "@Name" who can open the task. A name that
 *   matches nobody in that audience mentions nobody, so the text can't be used to
 *   find or reach other users. Two members with the same name are both notified.
 * - Comment: the task's assignee and the project's creator, if they can still
 *   open the task and weren't mentioned (a mention replaces the plain notice).
 *
 * The author is never notified (notificationRows drops the actor). Personal
 * tasks have no audience beyond their owner, so they notify nobody.
 */
async function commentNotifications(userId: string, taskId: string, commentId: string, content: string, access: CommentAccess) {
  const audience = await listTaskAudience(access.teamId);
  if (audience.length === 0) return [];

  const named = new Set(
    findMentions(
      content,
      audience.map((member) => member.user.name),
    ).map((mention) => mention.name.toLowerCase()),
  );
  const mentioned = audience
    .filter((member) => named.has(member.user.name.trim().toLowerCase()))
    .map((member) => member.userId);
  const canOpen = new Set(audience.map((member) => member.userId));
  const followers = [access.assigneeId, access.projectOwnerId].filter(
    (id): id is string => id !== null && canOpen.has(id) && !mentioned.includes(id),
  );
  const refs = { taskId, commentId };

  return [
    ...notificationRows("COMMENT_MENTION", mentioned, userId, refs),
    ...notificationRows("COMMENT_ADDED", followers, userId, refs),
  ];
}

export type CommentPage = {
  /** One page (up to 50), oldest first. */
  comments: CommentSummary[];
  /** Pass as `before` to get the next older page; null when there is nothing older. */
  nextCursor: string | null;
  /** All comments on the task, for the heading. */
  total: number;
};

/**
 * A page of comments: the latest 50, or the 50 before `before`. The task access
 * check runs on every call, so paging can't reach a task the user can't open.
 * "task-not-found" also covers a task that isn't accessible.
 */
export async function listCommentsForTask(
  userId: string,
  taskId: string,
  before?: string,
): Promise<CommentPage | { error: "task-not-found" | "invalid-cursor" }> {
  const cursor = before === undefined ? undefined : decodeCursor(before);
  if (cursor === null) return { error: "invalid-cursor" };

  const access = await getCommentAccess(userId, taskId);
  if (!access) return { error: "task-not-found" };

  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where: { taskId, ...olderThan(cursor) },
      select: commentSelect,
      orderBy: newestFirst,
      take: PAGE_SIZE + 1,
    }),
    prisma.comment.count({ where: { taskId } }),
  ]);
  const { page, nextCursor } = toPage(rows);

  return {
    comments: page.reverse().map((comment) => toSummary(comment, userId, access.canModerate)),
    nextCursor,
    total,
  };
}

type CommentError = { error: "task-not-found" | "comment-not-found" | "forbidden" };

export async function createComment(
  userId: string,
  taskId: string,
  content: string,
): Promise<{ comment: CommentSummary } | CommentError> {
  const access = await getCommentAccess(userId, taskId);
  if (!access) return { error: "task-not-found" };

  const id = randomUUID();
  const now = new Date();
  const notifications = await commentNotifications(userId, taskId, id, content, access);
  // The comment, its activity and its notifications are written together or not at all.
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { id, content, taskId, authorId: userId, createdAt: now, updatedAt: now },
      select: commentSelect,
    });

    await tx.activity.create({ data: activityRow("COMMENT_ADDED", taskId, userId, { commentId: id }) });

    if (notifications.length > 0) {
      await tx.notification.createMany({ data: notifications });
    }

    return created;
  });

  return { comment: toSummary(comment, userId, access.canModerate) };
}

/** Loads a comment only through its task, so a comment ID from another task finds nothing. */
async function findComment(
  userId: string,
  taskId: string,
  commentId: string,
): Promise<
  | { comment: { authorId: string; content: string }; canModerate: boolean }
  | { error: "task-not-found" | "comment-not-found" }
> {
  const access = await getCommentAccess(userId, taskId);
  if (!access) return { error: "task-not-found" };

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, taskId },
    select: { authorId: true, content: true },
  });

  return comment ? { comment, canModerate: access.canModerate } : { error: "comment-not-found" };
}

/** Author only: nobody edits someone else's words, whatever their role. */
export async function updateComment(
  userId: string,
  taskId: string,
  commentId: string,
  content: string,
): Promise<{ comment: CommentSummary } | CommentError> {
  const found = await findComment(userId, taskId, commentId);
  if ("error" in found) return { error: found.error };
  if (found.comment.authorId !== userId) return { error: "forbidden" };

  if (found.comment.content === content) {
    // Nothing changed: no write, no activity.
    const current = await prisma.comment.findUnique({ where: { id: commentId }, select: commentSelect });
    return current ? { comment: toSummary(current, userId, found.canModerate) } : { error: "comment-not-found" };
  }

  const [comment] = await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { content }, select: commentSelect }),
    prisma.activity.create({ data: activityRow("COMMENT_UPDATED", taskId, userId, { commentId }) }),
  ]);

  return { comment: toSummary(comment, userId, found.canModerate) };
}

/** The author, or an owner/admin of the task's team. */
export async function deleteComment(
  userId: string,
  taskId: string,
  commentId: string,
): Promise<{ deleted: true } | CommentError> {
  const found = await findComment(userId, taskId, commentId);
  if ("error" in found) return { error: found.error };
  if (found.comment.authorId !== userId && !found.canModerate) return { error: "forbidden" };

  // The activity records who deleted whose comment, never its text.
  await prisma.$transaction([
    prisma.comment.delete({ where: { id: commentId } }),
    prisma.activity.create({
      data: activityRow("COMMENT_DELETED", taskId, userId, { commentId, authorId: found.comment.authorId }),
    }),
  ]);

  return { deleted: true };
}
