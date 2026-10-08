import "server-only";

import { deleteAvatarFile, storeAvatar, type AvatarProcessError } from "@/lib/avatar-store";
import { toAvatarRef, type PresetAvatarId } from "@/lib/avatars";
import { prisma } from "@/lib/prisma";

/*
 * Changing the signed-in user's avatar. The user ID always comes from the
 * session. After the database points at the new avatar, the previously uploaded
 * file (if any) is deleted, so files never pile up.
 */

async function setAvatar(userId: string, avatarType: "INITIALS" | "PRESET" | "UPLOAD", avatarKey: string | null) {
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarType: true, avatarKey: true } });
  if (!previous) return null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarType, avatarKey },
    select: { avatarType: true, avatarKey: true },
  });

  if (previous.avatarType === "UPLOAD" && previous.avatarKey !== avatarKey) {
    await deleteAvatarFile(previous.avatarKey);
  }

  return toAvatarRef(updated);
}

export async function uploadAvatar(
  userId: string,
  image: Buffer,
): Promise<{ avatar: ReturnType<typeof toAvatarRef> } | { error: AvatarProcessError | "not-found" }> {
  const stored = await storeAvatar(image);
  if ("error" in stored) return { error: stored.error };

  const avatar = await setAvatar(userId, "UPLOAD", stored.key);

  if (avatar === null) {
    await deleteAvatarFile(stored.key);
    return { error: "not-found" as const };
  }

  return { avatar };
}

export const choosePresetAvatar = (userId: string, id: PresetAvatarId) => setAvatar(userId, "PRESET", id);

export const resetToInitials = (userId: string) => setAvatar(userId, "INITIALS", null);

/**
 * Who may see an uploaded avatar: its owner and anyone who shares a team with
 * them. Everyone else gets "not found", as if it didn't exist.
 */
export async function findViewableAvatar(viewerId: string, key: string) {
  const owner = await prisma.user.findFirst({
    where: {
      avatarType: "UPLOAD",
      avatarKey: key,
      OR: [{ id: viewerId }, { teamMemberships: { some: { team: { memberships: { some: { userId: viewerId } } } } } }],
    },
    select: { id: true },
  });

  return owner !== null;
}
