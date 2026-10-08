import "server-only";

import { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { activityRow } from "@/lib/activity";
import { inspectUpload, isInlineType, MAX_ATTACHMENTS_PER_TASK, type AttachmentProblem } from "@/lib/attachment-rules";
import {
  deleteAttachmentFiles,
  listStoredAttachmentKeys,
  readAttachmentFile,
  sha256Of,
  storeAttachmentFile,
} from "@/lib/attachment-store";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/team-validation";

/*
 * Attachments. A file belongs to one task, and the task's access rule is the
 * only one: whoever can open the task can list, download and add files. A file
 * can be deleted by the person who uploaded it or, in a team task, by the
 * team's owner and admins (the rule comments and time entries follow). Every
 * function takes the user ID from the server-side session. A task the user
 * can't access, and an attachment that isn't on that task, are both "not
 * found", so IDs can't be probed and a file can't be reached through another
 * task or project.
 */

/** Null when the user can't access the task; otherwise whether they may delete other people's files on it. */
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

/** Serializable shape for the task page. The storage key and the hash never leave the server. */
export type AttachmentSummary = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  /** Images can be opened in a tab; everything else is only downloaded. */
  inline: boolean;
  createdAt: string;
  /** Null once the account that uploaded it has been deleted. */
  uploader: { name: string; email: string; avatar: AvatarRef | null } | null;
  mine: boolean;
  canDelete: boolean;
};

const summarySelect = {
  id: true,
  name: true,
  size: true,
  mimeType: true,
  createdAt: true,
  uploaderId: true,
  uploader: { select: { name: true, email: true, ...avatarSelect } },
} as const;

type SummaryRow = Prisma.TaskAttachmentGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow, userId: string, canModerate: boolean): AttachmentSummary {
  const mine = row.uploaderId === userId;

  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mimeType: row.mimeType,
    inline: isInlineType(row.mimeType),
    createdAt: row.createdAt.toISOString(),
    uploader: row.uploader
      ? { name: row.uploader.name, email: row.uploader.email, avatar: toAvatarRef(row.uploader) }
      : null,
    mine,
    canDelete: mine || canModerate,
  };
}

/** A task's files, oldest first. Null when the task doesn't exist or isn't accessible. */
export async function listAttachments(userId: string, taskId: string): Promise<AttachmentSummary[] | null> {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return null;

  const rows = await prisma.taskAttachment.findMany({
    where: { taskId },
    select: summarySelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => toSummary(row, userId, access.canModerate));
}

export type AttachmentError =
  | "task-not-found"
  | "attachment-not-found"
  | "attachment-forbidden"
  | "attachment-duplicate"
  | "attachment-limit"
  | "attachment-missing-file"
  | AttachmentProblem;

/** Serialises additions to one task's files for the rest of the transaction, so the per-task limit can't be passed by simultaneous uploads. */
async function lockTaskAttachments(tx: Prisma.TransactionClient, taskId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attachments:${taskId}`}))`;
}

const isCode = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * Attaches a file to a task for the session user. The name is cleaned, the
 * type is decided from the extension and checked against the bytes, and the
 * same content can't be attached to one task twice. The file is written to
 * disk first and removed again if the database then refuses the row, so
 * neither a row without a file nor a file without a row is left behind.
 */
export async function addAttachment(
  userId: string,
  taskId: string,
  fileName: unknown,
  bytes: Uint8Array,
): Promise<{ attachment: AttachmentSummary } | { error: AttachmentError }> {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return { error: "task-not-found" };

  const inspected = inspectUpload(fileName, bytes);

  if ("error" in inspected) return inspected;

  const sha256 = sha256Of(bytes);

  // Before writing anything: the common refusals need no file on disk.
  if ((await prisma.taskAttachment.count({ where: { taskId, sha256 } })) > 0) return { error: "attachment-duplicate" };
  if ((await prisma.taskAttachment.count({ where: { taskId } })) >= MAX_ATTACHMENTS_PER_TASK) return { error: "attachment-limit" };

  const storageKey = await storeAttachmentFile(bytes);

  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockTaskAttachments(tx, taskId);

      // Counted again under the lock: this is the check that holds against simultaneous uploads.
      if ((await tx.taskAttachment.count({ where: { taskId } })) >= MAX_ATTACHMENTS_PER_TASK) return null;

      const created = await tx.taskAttachment.create({
        data: { taskId, uploaderId: userId, name: inspected.name, mimeType: inspected.mimeType, size: bytes.length, storageKey, sha256 },
        select: summarySelect,
      });

      await tx.activity.create({ data: activityRow("ATTACHMENT_ADDED", taskId, userId, { attachmentId: created.id }) });

      return created;
    });

    if (!row) {
      await deleteAttachmentFiles([storageKey]);
      return { error: "attachment-limit" };
    }

    return { attachment: toSummary(row, userId, access.canModerate) };
  } catch (error) {
    await deleteAttachmentFiles([storageKey]);

    // The unique (task, content) index: the same file sent twice at the same moment.
    if (isCode(error, "P2002")) return { error: "attachment-duplicate" };
    // The task was deleted in the same instant.
    if (isCode(error, "P2003")) return { error: "task-not-found" };

    throw error;
  }
}

/** The attachment if it is on this task and the user can open the task. */
async function findAttachment(userId: string, taskId: string, attachmentId: string) {
  const access = await getTaskAccess(userId, taskId);

  if (!access) return "task-not-found" as const;
  if (attachmentId.length > 100) return "attachment-not-found" as const;

  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, taskId },
    select: { id: true, name: true, mimeType: true, size: true, storageKey: true, uploaderId: true },
  });

  return attachment ? { access, attachment } : ("attachment-not-found" as const);
}

/** The file's bytes with the name and type to serve it under. "attachment-missing-file": the row exists but its file isn't on this server's disk. */
export async function readAttachment(
  userId: string,
  taskId: string,
  attachmentId: string,
): Promise<{ name: string; mimeType: string; inline: boolean; bytes: Buffer } | { error: AttachmentError }> {
  const found = await findAttachment(userId, taskId, attachmentId);

  if (typeof found === "string") return { error: found };

  const bytes = await readAttachmentFile(found.attachment.storageKey);

  if (!bytes) return { error: "attachment-missing-file" };

  return { name: found.attachment.name, mimeType: found.attachment.mimeType, inline: isInlineType(found.attachment.mimeType), bytes };
}

/** Deletes an attachment: one's own, or anyone's as the team's owner or admin. The row first, then the file. */
export async function deleteAttachment(
  userId: string,
  taskId: string,
  attachmentId: string,
): Promise<{ deleted: true } | { error: AttachmentError }> {
  const found = await findAttachment(userId, taskId, attachmentId);

  if (typeof found === "string") return { error: found };

  const { attachment, access } = found;

  if (attachment.uploaderId !== userId && !access.canModerate) return { error: "attachment-forbidden" };

  const deleted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.taskAttachment.deleteMany({
      where: { id: attachmentId, taskId, ...(access.canModerate ? {} : { uploaderId: userId }) },
    });

    if (count === 0) return false;

    await tx.activity.create({
      data: activityRow("ATTACHMENT_DELETED", taskId, userId, { attachmentId, authorId: attachment.uploaderId }),
    });

    return true;
  });

  if (!deleted) return { error: "attachment-not-found" };

  await deleteAttachmentFiles([attachment.storageKey]);

  return { deleted: true };
}

/* ------------------------- Files of deleted tasks ------------------------- */

/**
 * For the transaction that deletes one task: takes the task's attachment lock
 * (the one every upload to it takes) and removes its attachment rows, returning
 * their storage keys. An upload already under way finishes first and is
 * included; one that comes after waits, then finds the task gone and removes
 * its own file. So no file can slip in between "which files?" and the delete.
 */
export async function takeTaskAttachmentKeys(tx: Prisma.TransactionClient, taskId: string) {
  await lockTaskAttachments(tx, taskId);

  const rows = await tx.$queryRaw<{ storageKey: string }[]>`
    DELETE FROM "TaskAttachment" WHERE "taskId" = ${taskId} RETURNING "storageKey"`;

  return rows.map((row) => row.storageKey);
}

/**
 * The storage keys of the files on tasks matching `where`. Read just before
 * those tasks are deleted (the rows go with them, by cascade), so the files
 * can be removed once the delete has happened.
 */
export async function attachmentKeysOf(where: Prisma.TaskWhereInput) {
  const rows = await prisma.taskAttachment.findMany({ where: { task: where }, select: { storageKey: true } });

  return rows.map((row) => row.storageKey);
}

/** Removes the files of rows that no longer exist. A key whose row is still there (the delete didn't happen) is left alone. */
export async function removeFilesWithoutRows(keys: readonly string[]) {
  if (keys.length === 0) return 0;

  const kept = new Set(
    (await prisma.taskAttachment.findMany({ where: { storageKey: { in: [...keys] } }, select: { storageKey: true } })).map(
      (row) => row.storageKey,
    ),
  );
  const orphaned = keys.filter((key) => !kept.has(key));

  await deleteAttachmentFiles(orphaned);

  return orphaned.length;
}

/**
 * Removes stored files that have had no row for over an hour: what a crash
 * between writing a file and saving its row, or a task deleted through another
 * server sharing the database, can leave behind. Run once when the server starts.
 */
export async function sweepOrphanedAttachmentFiles() {
  return removeFilesWithoutRows(await listStoredAttachmentKeys(60 * 60 * 1000));
}
