import "server-only";

import bcrypt from "bcryptjs";

import { attachmentKeysOf, removeFilesWithoutRows } from "@/lib/attachments";
import { deleteAvatarFile } from "@/lib/avatar-store";
import { clearFailedAttempts, recordFailedAttempt, throttledFor } from "@/lib/password-throttle";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/users";

/*
 * Deleting the signed-in account. What happens to everything that refers to it:
 *
 *   Teams it owns          deletion is refused (listed); there is no ownership transfer
 *   Team memberships       removed (TeamMember cascade)
 *   Personal projects      deleted here first, with their tasks, comments, activity and notifications
 *   Team projects it made  kept for the team; creator becomes null and shows as "Deleted user"
 *   Tasks assigned to it   kept and unassigned (Task.assignee SET NULL), history kept
 *   Its comments           deleted (Comment.author cascade, as since Phase 9)
 *   Activity it caused     kept, shown as "Deleted user" (Activity.actor SET NULL)
 *   Notifications          its own deleted; ones it caused kept without an actor
 *   Attachments            files on its personal projects' tasks deleted; ones it uploaded to team tasks kept, without a name
 *   Task templates         its personal ones deleted (cascade); team templates kept, without it as assignee
 *   Invitations            every invitation to its email deleted
 *   Avatar file, 2FA data  deleted (file removed; secret and recovery codes go with the row)
 *   Sessions               all rejected afterwards: auth.ts finds no account for the token
 *
 * The confirmation (exact email, password, and a 2FA code when 2FA is on) is
 * checked here; wrong passwords count towards the same throttle as the
 * change-password form.
 */

export type DeletionInput = { email: string; password: string; code?: string };

export type DeletionResult =
  | { deleted: true }
  | { error: "not-found" | "email-mismatch" | "wrong-password" | "throttled" | "code-required" | "wrong-code" }
  | { error: "owns-teams"; teams: string[] };

/** Teams the user owns, which block deletion until they are deleted. */
export async function listOwnedTeamNames(userId: string) {
  const owned = await prisma.teamMember.findMany({
    where: { userId, role: "OWNER" },
    select: { team: { select: { name: true } } },
    orderBy: { team: { name: "asc" } },
  });

  return owned.map((membership) => membership.team.name);
}

export async function deleteAccount(
  userId: string,
  input: DeletionInput,
  verifySecondFactor: (userId: string, code: string) => Promise<boolean>,
): Promise<DeletionResult & { retryAfter?: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, avatarType: true, avatarKey: true, twoFactorEnabledAt: true },
  });

  if (!user) return { error: "not-found" };
  if (normalizeEmail(input.email) !== user.email) return { error: "email-mismatch" };

  const wait = throttledFor(userId);
  if (wait > 0) return { error: "throttled", retryAfter: wait };

  if (!(await bcrypt.compare(input.password, user.passwordHash))) {
    recordFailedAttempt(userId);
    return { error: "wrong-password" };
  }

  if (user.twoFactorEnabledAt) {
    if (!input.code) return { error: "code-required" };
    if (!(await verifySecondFactor(userId, input.code))) return { error: "wrong-code" };
  }

  clearFailedAttempts(userId);

  const teams = await listOwnedTeamNames(userId);
  if (teams.length > 0) return { error: "owns-teams", teams };

  // Files attached to tasks in the personal projects that are about to go with the account.
  const files = await attachmentKeysOf({ project: { ownerId: userId, teamId: null } });
  const deleted = await prisma.$transaction(async (tx) => {
    // Checked again inside the transaction, in case a team was created meanwhile.
    if ((await tx.teamMember.count({ where: { userId, role: "OWNER" } })) > 0) return false;

    await tx.project.deleteMany({ where: { ownerId: userId, teamId: null } });
    await tx.teamInvitation.deleteMany({ where: { email: user.email } });
    await tx.user.delete({ where: { id: userId } });

    return true;
  });

  if (!deleted) return { error: "owns-teams", teams: await listOwnedTeamNames(userId) };

  await removeFilesWithoutRows(files);

  if (user.avatarType === "UPLOAD") {
    await deleteAvatarFile(user.avatarKey);
  }

  return { deleted: true };
}
