// Shared by the API routes and the team UI, so it must stay free of server-only imports.
// The role values mirror the TeamRole enum in prisma/schema.prisma.
export const TEAM_NAME_MAX_LENGTH = 100;
export const TEAM_DESCRIPTION_MAX_LENGTH = 500;
export const INVITATION_EMAIL_MAX_LENGTH = 254;

export const TEAM_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
/** Roles that can be given to someone else; OWNER is only set when a team is created. */
export const ASSIGNABLE_TEAM_ROLES = ["ADMIN", "MEMBER"] as const;

export type TeamRoleValue = (typeof TEAM_ROLES)[number];
export type AssignableTeamRole = (typeof ASSIGNABLE_TEAM_ROLES)[number];

export const teamRoleLabels: Record<TeamRoleValue, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export type TeamInput = { name: string; description: string | null };
export type InvitationInput = { email: string; role: AssignableTeamRole };

/*
 * The permission rules. The server enforces them in lib/teams.ts and
 * lib/projects.ts; the UI uses the same functions only to decide what to show.
 */

/** Owners and admins manage the team's details, invitations and projects. */
export const canManageTeam = (role: TeamRoleValue) => role === "OWNER" || role === "ADMIN";

/** Assigning, reassigning and unassigning tasks in team projects: owners and admins. */
export const canAssignTasks = canManageTeam;

type MemberTarget = { role: TeamRoleValue; isSelf: boolean };

/** Nobody changes the owner's role or their own; admins may only change members. */
export function canChangeMemberRole(actorRole: TeamRoleValue, target: MemberTarget) {
  if (target.role === "OWNER" || target.isSelf) return false;

  return actorRole === "OWNER" || (actorRole === "ADMIN" && target.role === "MEMBER");
}

/**
 * The owner can never be removed (there is no ownership transfer yet, so the
 * team would be left without one). Anyone else may leave; owners remove anyone,
 * admins remove members.
 */
export function canRemoveMember(actorRole: TeamRoleValue, target: MemberTarget) {
  if (target.role === "OWNER") return false;
  if (target.isSelf) return true;

  return actorRole === "OWNER" || (actorRole === "ADMIN" && target.role === "MEMBER");
}

type ValidationResult<T> = { data: T } | { error: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isAssignableRole = (value: unknown): value is AssignableTeamRole =>
  ASSIGNABLE_TEAM_ROLES.includes(value as AssignableTeamRole);

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function validateName(value: unknown): ValidationResult<string> {
  const name = typeof value === "string" ? value.trim() : "";

  if (!name) {
    return { error: "Enter a team name." };
  }

  if (name.length > TEAM_NAME_MAX_LENGTH) {
    return { error: `Team name must be ${TEAM_NAME_MAX_LENGTH} characters or fewer.` };
  }

  return { data: name };
}

function validateDescription(value: unknown): ValidationResult<string | null> {
  const description = typeof value === "string" ? value.trim() : "";

  if (description.length > TEAM_DESCRIPTION_MAX_LENGTH) {
    return { error: `Description must be ${TEAM_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }

  return { data: description || null };
}

export function validateTeamInput(body: unknown): ValidationResult<TeamInput> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Enter a team name." };
  }

  const name = validateName(payload.name);
  if ("error" in name) return name;

  const description = validateDescription(payload.description);
  if ("error" in description) return description;

  return { data: { name: name.data, description: description.data } };
}

/** Validates a partial update; only the fields present in the body are changed. */
export function validateTeamUpdate(body: unknown): ValidationResult<Partial<TeamInput>> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Request body must be a JSON object." };
  }

  const data: Partial<TeamInput> = {};

  if ("name" in payload) {
    const name = validateName(payload.name);
    if ("error" in name) return name;
    data.name = name.data;
  }

  if ("description" in payload) {
    const description = validateDescription(payload.description);
    if ("error" in description) return description;
    data.description = description.data;
  }

  if (Object.keys(data).length === 0) {
    return { error: "Nothing to update." };
  }

  return { data };
}

export function validateInvitationInput(body: unknown): ValidationResult<InvitationInput> {
  const payload = asObject(body);
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!email) {
    return { error: "Enter an email address." };
  }

  if (email.length > INVITATION_EMAIL_MAX_LENGTH || !emailPattern.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const role = payload?.role ?? "MEMBER";

  if (!isAssignableRole(role)) {
    return { error: "Choose a valid role." };
  }

  return { data: { email, role } };
}

export function validateMemberRole(body: unknown): ValidationResult<AssignableTeamRole> {
  const role = asObject(body)?.role;

  return isAssignableRole(role) ? { data: role } : { error: "Choose a valid role." };
}
