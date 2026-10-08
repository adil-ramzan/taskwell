import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { decodeCursor, newestFirst, olderThan, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

export const NOTIFICATION_PAGE_SIZE = 20;

/*
 * Notifications are only ever written on the server, by the data layer, in the
 * same transaction as the change that causes them (lib/tasks.ts, lib/comments.ts,
 * lib/teams.ts), or by the reminder scheduler when a reminder's time comes
 * (lib/reminders.ts). There is no API that accepts a notification or a recipient.
 * A row holds references only; names and titles are looked up when it is read.
 */

type Refs = { taskId?: string; commentId?: string; invitationId?: string };

/**
 * Rows for `notification.createMany`: one per recipient, never one for the
 * actor, and no duplicates. Callers pass recipients they have already checked
 * may see the thing the notification points at.
 */
export function notificationRows(
  type: NotificationType,
  recipientIds: Iterable<string | null | undefined>,
  actorId: string,
  refs: Refs,
): Prisma.NotificationCreateManyInput[] {
  const recipients = new Set<string>();

  for (const id of recipientIds) {
    if (id && id !== actorId) recipients.add(id);
  }

  return [...recipients].map((recipientId) => ({ type, recipientId, actorId, ...refs }));
}

/**
 * What a user may see: their own notifications, and a task notification only
 * while they can still open that task (they may have left the team since).
 */
const visibleTo = (userId: string): Prisma.NotificationWhereInput => ({
  recipientId: userId,
  OR: [{ taskId: null }, { task: { project: projectAccessWhere(userId) } }],
});

/** Serializable shape for the notification panel. Never contains an invitation token. */
export type NotificationSummary = {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  /** Null when the account that caused it has since been deleted, and for a reminder (nobody caused it). */
  actor: string | null;
  /** For a reminder: the task's due date as it is now (ISO instant), or null if it no longer has one. */
  dueDate?: string | null;
  /** The task title, or the team name for an invitation. */
  subject: string;
  href: string;
};

export type NotificationPage = {
  /** One page (up to 20), newest first. */
  notifications: NotificationSummary[];
  /** Pass as `before` to get the next older page; null when there is nothing older. */
  nextCursor: string | null;
  unreadCount: number;
};

export function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { ...visibleTo(userId), readAt: null } });
}

/**
 * What the bell polls: the unread count and the ID of the newest notification
 * the user can see (null when there is none). Either one changing means the
 * list has changed, including when the count happens to stay the same.
 */
export async function getNotificationPulse(userId: string) {
  const [count, latest] = await Promise.all([
    countUnreadNotifications(userId),
    prisma.notification.findFirst({ where: visibleTo(userId), select: { id: true }, orderBy: newestFirst }),
  ]);

  return { count, latestId: latest?.id ?? null };
}

export async function listNotifications(
  userId: string,
  before?: string,
): Promise<NotificationPage | { error: "invalid-cursor" }> {
  const cursor = before === undefined ? undefined : decodeCursor(before);
  if (cursor === null) return { error: "invalid-cursor" };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { AND: [visibleTo(userId), olderThan(cursor)] },
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        actor: { select: { name: true } },
        task: { select: { id: true, title: true, dueDate: true } },
        invitation: {
          select: {
            teamId: true,
            acceptedAt: true,
            team: { select: { name: true, memberships: { where: { userId }, select: { id: true } } } },
          },
        },
      },
      orderBy: newestFirst,
      take: NOTIFICATION_PAGE_SIZE + 1,
    }),
    countUnreadNotifications(userId),
  ]);
  const { page, nextCursor } = toPage(rows, NOTIFICATION_PAGE_SIZE);
  const notifications: NotificationSummary[] = [];

  for (const row of page) {
    const base = {
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
      actor: row.actor?.name ?? null,
    };

    if (row.type === "TEAM_INVITATION") {
      if (!row.invitation) continue;

      const { team, teamId, acceptedAt } = row.invitation;
      // An open invitation is answered on the Teams page, which lists it for the
      // invited account, so the link never needs to carry the token.
      const joined = acceptedAt !== null && team.memberships.length > 0;

      notifications.push({ ...base, subject: team.name, href: joined ? `/dashboard/teams/${teamId}` : "/dashboard/teams" });
    } else if (row.task) {
      const { id, title, dueDate } = row.task;

      if (row.type === "TASK_REMINDER") {
        notifications.push({ ...base, subject: title, href: `/dashboard/tasks/${id}`, dueDate: dueDate?.toISOString() ?? null });
      } else {
        const anchor = row.type === "TASK_ASSIGNED" ? "" : "#task-comments-heading";

        notifications.push({ ...base, subject: title, href: `/dashboard/tasks/${id}${anchor}` });
      }
    }
  }

  return { notifications, nextCursor, unreadCount };
}

/** False when the notification doesn't exist or belongs to someone else (the two look the same). */
export async function markNotificationRead(userId: string, notificationId: string) {
  if (notificationId.length > 100) return false;

  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (count > 0) return true;

  // Already read is still a success.
  return (await prisma.notification.count({ where: { id: notificationId, recipientId: userId } })) > 0;
}

/** Marks every unread notification of this user as read; returns how many changed. */
export async function markAllNotificationsRead(userId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  return count;
}
