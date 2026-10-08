import "server-only";

import { TeamRole, type Prisma } from "@prisma/client";

/*
 * The one definition of who can reach a project (and, through it, its tasks).
 * Callers must pass the user ID from the server-side session.
 *
 * Personal project (teamId is null): only its owner.
 * Team project: members of its team; ownerId is just the creator there.
 */

/** Projects the user can see, and whose tasks they can see, create, edit and delete. */
export function projectAccessWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { teamId: null, ownerId: userId },
      { team: { memberships: { some: { userId } } } },
    ],
  };
}

/** Projects the user can edit or delete: their personal ones, and team ones where they are owner or admin. */
export function projectManageWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { teamId: null, ownerId: userId },
      { team: { memberships: { some: { userId, role: { in: [TeamRole.OWNER, TeamRole.ADMIN] } } } } },
    ],
  };
}
