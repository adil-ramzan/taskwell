import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { cache } from "react";

import { activityRow } from "@/lib/activity";
import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import type { InvitationDelivery } from "@/lib/invitation-email";
import { notificationRows } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { stopTimerInTeam } from "@/lib/time-tracking";
import { attachmentKeysOf, removeFilesWithoutRows } from "@/lib/attachments";
import {
  canChangeMemberRole,
  canManageTeam,
  canRemoveMember,
  type AssignableTeamRole,
  type InvitationInput,
  type TeamInput,
  type TeamRoleValue,
} from "@/lib/team-validation";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Serializable shapes passed from Server Components and API routes to the client. */
export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  /** The current user's role in the team. */
  role: TeamRoleValue;
  memberCount: number;
  projectCount: number;
};

export type TeamMemberSummary = {
  /** TeamMember ID (not the user ID). */
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar: AvatarRef | null;
  role: TeamRoleValue;
  joinedAt: string;
  isSelf: boolean;
};

/** Never includes the token; that is only returned once, to the inviter, on creation. */
export type TeamInvitationSummary = {
  id: string;
  email: string;
  role: TeamRoleValue;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  /** When the invitation email was last accepted by the email provider; null if it never was. */
  emailSentAt: string | null;
};

/*
 * Every function takes the user ID from the server-side session and checks that
 * user's membership (and role, where needed) itself. "not-found" is returned
 * both for a team that doesn't exist and for one the user isn't a member of,
 * so team IDs can't be probed. "forbidden" means: a member, but the role
 * doesn't allow it.
 */
type TeamError<E extends string = never> = { error: "not-found" | "forbidden" | E };

/** The single membership lookup behind every permission check. Deduplicated per request. */
export const getTeamMembership = cache(async (userId: string, teamId: string) =>
  prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { id: true, role: true },
  }),
);

/** Resolves to the member's role, or the error to return. */
async function requireTeamRole(
  userId: string,
  teamId: string,
  allowed: (role: TeamRoleValue) => boolean = () => true,
): Promise<{ role: TeamRoleValue } | TeamError> {
  const membership = await getTeamMembership(userId, teamId);

  if (!membership) return { error: "not-found" };

  return allowed(membership.role) ? { role: membership.role } : { error: "forbidden" };
}

const teamSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    memberships: { where: { userId }, select: { role: true } },
    _count: { select: { memberships: true, projects: true } },
  }) satisfies Prisma.TeamSelect;

type TeamRow = Prisma.TeamGetPayload<{ select: ReturnType<typeof teamSelect> }>;

function toSummary(team: TeamRow): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
    // Queries below only return teams the user is a member of.
    role: team.memberships[0].role,
    memberCount: team._count.memberships,
    projectCount: team._count.projects,
  };
}

const isMember = (userId: string) => ({ memberships: { some: { userId } } });

/** Deduplicated per request (layout + page). */
export const listTeamsForUser = cache(async (userId: string) => {
  const teams = await prisma.team.findMany({
    where: isMember(userId),
    select: teamSelect(userId),
    orderBy: { name: "asc" },
  });

  return teams.map(toSummary);
});

/** Null when the team doesn't exist or the user isn't a member. Deduplicated per request. */
export const getTeamForUser = cache(async (userId: string, teamId: string) => {
  const team = await prisma.team.findFirst({
    where: { id: teamId, ...isMember(userId) },
    select: teamSelect(userId),
  });

  return team ? toSummary(team) : null;
});

/** The creator becomes the team's OWNER; both rows are written in one transaction (nested create). */
export async function createTeamForUser(userId: string, input: TeamInput) {
  const team = await prisma.team.create({
    data: { ...input, memberships: { create: { userId, role: "OWNER" } } },
    select: teamSelect(userId),
  });

  return toSummary(team);
}

export async function updateTeamForUser(
  userId: string,
  teamId: string,
  data: Partial<TeamInput>,
): Promise<{ team: TeamSummary } | TeamError> {
  const access = await requireTeamRole(userId, teamId, canManageTeam);
  if ("error" in access) return access;

  await prisma.team.update({ where: { id: teamId }, data });
  const team = await prisma.team.findFirst({
    where: { id: teamId, ...isMember(userId) },
    select: teamSelect(userId),
  });

  return team ? { team: toSummary(team) } : { error: "not-found" };
}

/** Owner only. Memberships, invitations, projects and their tasks go with it (onDelete: Cascade). */
export async function deleteTeamForOwner(userId: string, teamId: string): Promise<{ deleted: true } | TeamError> {
  // The files attached to the team's tasks: their rows go with the team, the files are removed afterwards.
  const files = await attachmentKeysOf({ project: { teamId, team: { memberships: { some: { userId, role: "OWNER" } } } } });
  // deleteMany lets the owner check and the delete happen in one statement.
  const { count } = await prisma.team.deleteMany({
    where: { id: teamId, memberships: { some: { userId, role: "OWNER" } } },
  });

  await removeFilesWithoutRows(files);

  if (count > 0) return { deleted: true };

  return { error: (await getTeamMembership(userId, teamId)) ? "forbidden" : "not-found" };
}

/** Null when the user isn't a member of the team. Owner first, then admins, then members. */
export async function listTeamMembersForUser(userId: string, teamId: string) {
  if (!(await getTeamMembership(userId, teamId))) return null;

  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true, email: true, ...avatarSelect } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return members.map(
    (member): TeamMemberSummary => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      avatar: toAvatarRef(member.user),
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      isSelf: member.userId === userId,
    }),
  );
}

async function findMemberTarget(userId: string, teamId: string, memberId: string) {
  const member = await prisma.teamMember.findFirst({
    where: { id: memberId, teamId },
    select: { role: true, userId: true },
  });

  return member ? { role: member.role, userId: member.userId, isSelf: member.userId === userId } : null;
}

export async function updateTeamMemberRole(
  userId: string,
  teamId: string,
  memberId: string,
  role: AssignableTeamRole,
): Promise<{ updated: true } | TeamError<"member-not-found">> {
  const access = await requireTeamRole(userId, teamId);
  if ("error" in access) return access;

  const target = await findMemberTarget(userId, teamId, memberId);
  if (!target) return { error: "member-not-found" };
  if (!canChangeMemberRole(access.role, target)) return { error: "forbidden" };

  // Matching on the role that was checked keeps the rule true if it changed meanwhile.
  const { count } = await prisma.teamMember.updateMany({
    where: { id: memberId, teamId, role: target.role },
    data: { role },
  });

  return count > 0 ? { updated: true } : { error: "member-not-found" };
}

/** Also used by a member to leave the team (memberId is their own membership). */
export async function removeTeamMember(
  userId: string,
  teamId: string,
  memberId: string,
): Promise<{ removed: true } | TeamError<"member-not-found">> {
  const access = await requireTeamRole(userId, teamId);
  if ("error" in access) return access;

  const target = await findMemberTarget(userId, teamId, memberId);
  if (!target) return { error: "member-not-found" };
  if (!canRemoveMember(access.role, target)) return { error: "forbidden" };

  // Their tasks in this team's projects stay, but become unassigned, in the same
  // transaction: an assignee must always be a member of the project's team. Each
  // of those tasks gets an activity, with whoever did the removing as the actor.
  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.teamMember.deleteMany({ where: { id: memberId, teamId, role: target.role } });

    if (count === 0) return false;

    const assigned = { assigneeId: target.userId, project: { teamId } };
    const tasks = await tx.task.findMany({ where: assigned, select: { id: true } });

    if (tasks.length > 0) {
      await tx.task.updateMany({ where: assigned, data: { assigneeId: null } });
      await tx.activity.createMany({
        data: tasks.map((task) =>
          activityRow("TASK_ASSIGNEE_CHANGED", task.id, userId, { fromUserId: target.userId, toUserId: null }),
        ),
      });
    }

    // A timer they left running on one of the team's tasks ends now; the time so far is kept.
    await stopTimerInTeam(tx, target.userId, teamId);

    // Nor can they stay the default assignee of the team's task templates.
    await tx.taskTemplate.updateMany({ where: { teamId, assigneeId: target.userId }, data: { assigneeId: null } });

    return true;
  });

  return removed ? { removed: true } : { error: "member-not-found" };
}

export type AssignableMember = { id: string; name: string; email: string };

/**
 * The people this user may assign tasks to, by team: every member of each team
 * where the user is owner or admin. One query; `id` is the user ID.
 */
export const listAssignableMembersByTeam = cache(async (userId: string) => {
  const members = await prisma.teamMember.findMany({
    where: { team: { memberships: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } } },
    select: { teamId: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const byTeam: Record<string, AssignableMember[]> = {};

  for (const member of members) {
    (byTeam[member.teamId] ??= []).push(member.user);
  }

  return byTeam;
});

/** teamId -> that team's members, as { id (user ID), name }. */
export type TeamMembersByTeam = Record<string, { id: string; name: string }[]>;

/**
 * The members of every team this user belongs to, for the assignee filters.
 * One query; only teams the session user is a member of are ever returned, so
 * it can't be used to list the people of another team.
 */
export async function listTeamMembersByTeam(userId: string) {
  const members = await prisma.teamMember.findMany({
    where: { team: isMember(userId) },
    select: { teamId: true, user: { select: { id: true, name: true } } },
  });
  const byTeam: TeamMembersByTeam = {};

  for (const member of members) {
    (byTeam[member.teamId] ??= []).push(member.user);
  }

  return byTeam;
}

/* ------------------------------ Invitations ------------------------------ */

function toInvitationSummary(invitation: {
  id: string;
  email: string;
  role: TeamRoleValue;
  createdAt: Date;
  expiresAt: Date;
  emailSentAt: Date | null;
}): TeamInvitationSummary {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    expired: invitation.expiresAt <= new Date(),
    emailSentAt: invitation.emailSentAt?.toISOString() ?? null,
  };
}

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  emailSentAt: true,
} as const;

/** How long to wait before the same invitation's email can be sent again. */
const RESEND_COOLDOWN_MS = 60_000;

async function getDeliveryNames(userId: string, teamId: string) {
  const [team, inviter] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);

  return { teamName: team?.name ?? "a team", inviterName: inviter?.name.trim() || "A teammate" };
}

/**
 * Owner/admin only. Saves the invitation and, if the address already has an
 * account, a notification for it, in one transaction. Sending the email is the
 * caller's next step (`delivery` is what it needs), so a failed send leaves a
 * valid invitation. The token is also returned once for the inviter's own link.
 */
export async function inviteTeamMember(
  userId: string,
  teamId: string,
  input: InvitationInput,
): Promise<
  | { invitation: TeamInvitationSummary; token: string; delivery: InvitationDelivery }
  | TeamError<"already-member" | "already-invited">
> {
  const access = await requireTeamRole(userId, teamId, canManageTeam);
  if ("error" in access) return access;

  const now = new Date();
  const [member, pending] = await Promise.all([
    prisma.teamMember.findFirst({ where: { teamId, user: { email: input.email } }, select: { id: true } }),
    prisma.teamInvitation.findFirst({
      where: { teamId, email: input.email, acceptedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    }),
  ]);

  if (member) return { error: "already-member" };
  if (pending) return { error: "already-invited" };

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  // The recipient of the notification is whoever owns the invited address, looked up here.
  const [account, names] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    getDeliveryNames(userId, teamId),
  ]);
  const invitation = await prisma.$transaction(async (tx) => {
    // Replace this address's expired, unused invitations rather than piling them up
    // (their notifications go with them).
    await tx.teamInvitation.deleteMany({ where: { teamId, email: input.email, acceptedAt: null } });

    const created = await tx.teamInvitation.create({
      data: { teamId, ...input, token, expiresAt },
      select: invitationSelect,
    });
    const notifications = notificationRows("TEAM_INVITATION", [account?.id], userId, { invitationId: created.id });

    if (notifications.length > 0) {
      await tx.notification.createMany({ data: notifications });
    }

    return created;
  });

  return {
    invitation: toInvitationSummary(invitation),
    token,
    delivery: { invitationId: invitation.id, email: invitation.email, token, role: invitation.role, expiresAt, ...names },
  };
}

/**
 * Owner/admin only: what is needed to send a pending invitation's email again.
 * The same invitation and token are reused, so resending never creates a second
 * invitation or extends the 7 days. An expired one must be invited afresh.
 */
export async function getInvitationDelivery(
  userId: string,
  teamId: string,
  invitationId: string,
): Promise<
  { delivery: InvitationDelivery } | TeamError<"invitation-not-found" | "invitation-expired" | "resend-too-soon">
> {
  const access = await requireTeamRole(userId, teamId, canManageTeam);
  if ("error" in access) return access;

  const invitation = await prisma.teamInvitation.findFirst({
    where: { id: invitationId, teamId, acceptedAt: null },
    select: { id: true, email: true, token: true, role: true, expiresAt: true, emailSentAt: true },
  });

  if (!invitation) return { error: "invitation-not-found" };
  if (invitation.expiresAt <= new Date()) return { error: "invitation-expired" };

  if (invitation.emailSentAt && Date.now() - invitation.emailSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { error: "resend-too-soon" };
  }

  return {
    delivery: {
      invitationId: invitation.id,
      email: invitation.email,
      token: invitation.token,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      ...(await getDeliveryNames(userId, teamId)),
    },
  };
}

/** Pending (not yet accepted) invitations, owner/admin only. Null when not allowed. */
export async function listTeamInvitations(userId: string, teamId: string) {
  const access = await requireTeamRole(userId, teamId, canManageTeam);
  if ("error" in access) return null;

  const invitations = await prisma.teamInvitation.findMany({
    where: { teamId, acceptedAt: null },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
  });

  return invitations.map(toInvitationSummary);
}

export async function cancelTeamInvitation(
  userId: string,
  teamId: string,
  invitationId: string,
): Promise<{ cancelled: true } | TeamError<"invitation-not-found">> {
  const access = await requireTeamRole(userId, teamId, canManageTeam);
  if ("error" in access) return access;

  const { count } = await prisma.teamInvitation.deleteMany({
    where: { id: invitationId, teamId, acceptedAt: null },
  });

  return count > 0 ? { cancelled: true } : { error: "invitation-not-found" };
}

// The account's email is read from the database, not taken from the request.
async function getUserEmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  return user?.email ?? null;
}

/** The signed-in user's own open invitations. The token goes only to the invited account. */
export async function listInvitationsForUser(userId: string) {
  const email = await getUserEmail(userId);
  if (!email) return [];

  const invitations = await prisma.teamInvitation.findMany({
    where: {
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      team: { memberships: { none: { userId } } },
    },
    select: { token: true, role: true, expiresAt: true, team: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return invitations.map((invitation) => ({
    token: invitation.token,
    role: invitation.role,
    teamName: invitation.team.name,
    expiresAt: invitation.expiresAt.toISOString(),
  }));
}

export type InvitationProblem = "invalid" | "expired" | "accepted" | "wrong-email";

/** Loads an invitation for the signed-in user; team details are only revealed to the invited account. */
type FoundInvitation = {
  id: string;
  teamId: string;
  role: TeamRoleValue;
  expiresAt: Date;
  team: { name: string };
};

async function findInvitationForUser(
  userId: string,
  token: string,
): Promise<{ invitation: FoundInvitation } | { problem: InvitationProblem; teamId?: string }> {
  const [email, invitation] = await Promise.all([
    getUserEmail(userId),
    prisma.teamInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        teamId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        team: { select: { name: true } },
      },
    }),
  ]);

  if (!invitation || !email) return { problem: "invalid" };
  if (invitation.email !== email) return { problem: "wrong-email" };
  if (invitation.acceptedAt) return { problem: "accepted", teamId: invitation.teamId };
  if (invitation.expiresAt <= new Date()) return { problem: "expired" };

  return { invitation };
}

export async function getInvitationForUser(userId: string, token: string) {
  const found = await findInvitationForUser(userId, token);

  if ("problem" in found) return found;

  return {
    teamName: found.invitation.team.name,
    role: found.invitation.role,
    expiresAt: found.invitation.expiresAt.toISOString(),
  };
}

export async function acceptTeamInvitation(
  userId: string,
  token: string,
): Promise<{ teamId: string } | { error: InvitationProblem }> {
  const found = await findInvitationForUser(userId, token);
  if ("problem" in found) return { error: found.problem };

  const { invitation } = found;
  const now = new Date();

  // Claiming the invitation and creating the membership succeed or fail together.
  const accepted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.teamInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });

    if (count === 0) return false;

    // Already a member (added another way): keep that membership and role.
    await tx.teamMember.upsert({
      where: { teamId_userId: { teamId: invitation.teamId, userId } },
      create: { teamId: invitation.teamId, userId, role: invitation.role },
      update: {},
    });

    return true;
  });

  return accepted ? { teamId: invitation.teamId } : { error: "accepted" };
}

export async function declineTeamInvitation(
  userId: string,
  token: string,
): Promise<{ declined: true } | { error: InvitationProblem }> {
  const found = await findInvitationForUser(userId, token);
  if ("problem" in found) return { error: found.problem };

  const { count } = await prisma.teamInvitation.deleteMany({
    where: { id: found.invitation.id, acceptedAt: null },
  });

  return count > 0 ? { declined: true } : { error: "invalid" };
}
