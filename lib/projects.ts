import "server-only";

import type { Prisma } from "@prisma/client";
import { cache } from "react";

import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import { projectAccessWhere, projectManageWhere } from "@/lib/access";
import { attachmentKeysOf, removeFilesWithoutRows } from "@/lib/attachments";
import { prisma } from "@/lib/prisma";
import type { ProjectCreateInput, ProjectInput } from "@/lib/project-validation";
import { canManageTeam } from "@/lib/team-validation";

/** Serializable shape passed from Server Components to the client. */
export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** The creator; null for a team project whose creator's account was deleted. */
  owner: { name: string; email: string; avatar: AvatarRef | null } | null;
  /** Null for a personal project. */
  team: { id: string; name: string } | null;
  /** Whether the current user may edit or delete the project. */
  canManage: boolean;
};

// The membership sub-select is limited to the current user, to work out canManage.
const projectSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    description: true,
    ownerId: true,
    createdAt: true,
    updatedAt: true,
    owner: { select: { name: true, email: true, ...avatarSelect } },
    team: {
      select: { id: true, name: true, memberships: { where: { userId }, select: { role: true } } },
    },
  }) satisfies Prisma.ProjectSelect;

type ProjectRow = Prisma.ProjectGetPayload<{ select: ReturnType<typeof projectSelect> }>;

function toSummary(project: ProjectRow, userId: string): ProjectSummary {
  const role = project.team?.memberships[0]?.role;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    owner: project.owner ? { name: project.owner.name, email: project.owner.email, avatar: toAvatarRef(project.owner) } : null,
    team: project.team ? { id: project.team.id, name: project.team.name } : null,
    canManage: project.team ? role !== undefined && canManageTeam(role) : project.ownerId === userId,
  };
}

/*
 * Every query is scoped with lib/access.ts: the user's personal projects plus
 * the projects of teams they belong to. Callers must pass the ID from the
 * server-side session, never a value supplied by the browser. (The "ForOwner"
 * names predate team projects; ownerId here is always the session user.)
 */
export async function listProjectsForOwner(ownerId: string) {
  const projects = await prisma.project.findMany({
    where: projectAccessWhere(ownerId),
    select: projectSelect(ownerId),
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => toSummary(project, ownerId));
}

/** A team's projects; empty when the user isn't a member of the team. */
export async function listProjectsForTeam(userId: string, teamId: string) {
  const projects = await prisma.project.findMany({
    where: { AND: [{ teamId }, projectAccessWhere(userId)] },
    select: projectSelect(userId),
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => toSummary(project, userId));
}

/**
 * Minimal list for project pickers and filters; teamId (null = personal) tells
 * the task dialog whose members can be assigned. Deduplicated per request.
 */
export const listProjectOptionsForOwner = cache(async (ownerId: string) =>
  prisma.project.findMany({
    where: projectAccessWhere(ownerId),
    select: { id: true, name: true, teamId: true },
    orderBy: { name: "asc" },
  }),
);

export async function getProjectForOwner(ownerId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { AND: [{ id: projectId }, projectAccessWhere(ownerId)] },
    select: projectSelect(ownerId),
  });

  return project ? toSummary(project, ownerId) : null;
}

/**
 * Creates a personal project, or a team project when input.teamId is set. A team
 * project requires the user to be an owner or admin of that team: "team-not-found"
 * also covers a team the user doesn't belong to.
 */
export async function createProjectForOwner(
  ownerId: string,
  input: ProjectCreateInput,
): Promise<{ project: ProjectSummary } | { error: "team-not-found" | "forbidden" }> {
  if (input.teamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: ownerId } },
      select: { role: true },
    });

    if (!membership) {
      return { error: "team-not-found" };
    }

    if (!canManageTeam(membership.role)) {
      return { error: "forbidden" };
    }
  }

  const project = await prisma.project.create({
    data: { ...input, ownerId },
    select: projectSelect(ownerId),
  });

  return { project: toSummary(project, ownerId) };
}

/** "forbidden": the user can see the project (team member) but may not manage it. */
type ManageError = { error: "not-found" | "forbidden" };

async function manageError(ownerId: string, projectId: string): Promise<ManageError> {
  return { error: (await getProjectForOwner(ownerId, projectId)) ? "forbidden" : "not-found" };
}

export async function updateProjectForOwner(
  ownerId: string,
  projectId: string,
  data: Partial<ProjectInput>,
): Promise<{ project: ProjectSummary } | ManageError> {
  // updateMany lets the permission filter and the write happen in one statement.
  const { count } = await prisma.project.updateMany({
    where: { AND: [{ id: projectId }, projectManageWhere(ownerId)] },
    data,
  });
  const project = count > 0 ? await getProjectForOwner(ownerId, projectId) : null;

  return project ? { project } : manageError(ownerId, projectId);
}

/** The project's tasks are removed by the Task.project onDelete: Cascade relation; their attached files are removed afterwards. */
export async function deleteProjectForOwner(
  ownerId: string,
  projectId: string,
): Promise<{ deleted: true } | ManageError> {
  const files = await attachmentKeysOf({ project: { AND: [{ id: projectId }, projectManageWhere(ownerId)] } });
  const { count } = await prisma.project.deleteMany({
    where: { AND: [{ id: projectId }, projectManageWhere(ownerId)] },
  });

  // Only files whose rows are gone: a delete that was refused removes nothing.
  await removeFilesWithoutRows(files);

  return count > 0 ? { deleted: true } : manageError(ownerId, projectId);
}
