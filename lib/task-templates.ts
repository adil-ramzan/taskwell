import "server-only";

import { Prisma, TeamRole } from "@prisma/client";

import { avatarSelect, toAvatarRef, type AvatarRef } from "@/lib/avatars";
import type { LabelRef } from "@/lib/label-rules";
import { inScope, labelRefSelect, labelsInScope, scopeOfProject, sortLabels, toLabelRef, type LabelError, type LabelScope } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { validateTaskInput, type TaskPriorityValue, type TaskStatusValue } from "@/lib/task-validation";
import { accountTimeZone, checkAssignment, createTask, findAccessibleProject, type TaskSummary } from "@/lib/tasks";
import {
  dueDateForOffset,
  MAX_TEMPLATES_PER_WORKSPACE,
  TEMPLATE_NAME_MAX_LENGTH,
  templateNameKey,
  type TemplateFields,
  type TemplateInput,
  type TemplateUse,
} from "@/lib/template-rules";

/*
 * Task templates. A template belongs to one workspace, exactly like a label:
 * a person's (TaskTemplate.ownerId) or a team's (TaskTemplate.teamId). Who can
 * reach it follows from that, with the user ID always taken from the
 * server-side session:
 *
 *  - see it, use it, duplicate it: the owner, or any member of the team;
 *  - create one: the same;
 *  - edit or delete it: the owner, or the team's owner and admins.
 *
 * A template is only a set of starting values. Creating a task from one goes
 * through createTask (lib/tasks.ts) like any new task, for the session user and
 * a project they chose, so the task gets the normal access checks, history and
 * notifications, and keeps no link to the template: editing or deleting a
 * template never changes a task.
 */

/** Templates the user can see and use. */
function templateAccessWhere(userId: string): Prisma.TaskTemplateWhereInput {
  return { OR: [{ ownerId: userId }, { team: { memberships: { some: { userId } } } }] };
}

/** Templates the user can edit or delete. */
function templateManageWhere(userId: string): Prisma.TaskTemplateWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { team: { memberships: { some: { userId, role: { in: [TeamRole.OWNER, TeamRole.ADMIN] } } } } },
    ],
  };
}

const scopeWhere = (scope: LabelScope): Prisma.TaskTemplateWhereInput =>
  scope.teamId ? { teamId: scope.teamId } : { ownerId: scope.ownerId, teamId: null };

/** Serializable shape passed from Server Components and API routes to the client. */
export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** Days after the day a task is created from it; null = no due date. */
  dueOffsetDays: number | null;
  /** Team templates only; null also once that person has left the team or deleted their account. */
  assignee: { id: string; name: string; email: string; avatar: AvatarRef | null } | null;
  /** Labels of the template's own workspace, by name. */
  labels: LabelRef[];
  /** Subtask titles, in order. */
  subtasks: string[];
  /** Null for a personal template, otherwise the team it belongs to. */
  team: { id: string; name: string } | null;
  /** May the current user edit or delete it. */
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};

const summarySelect = (userId: string) =>
  ({
    id: true,
    name: true,
    description: true,
    status: true,
    priority: true,
    dueOffsetDays: true,
    ownerId: true,
    createdAt: true,
    updatedAt: true,
    assignee: { select: { id: true, name: true, email: true, ...avatarSelect } },
    labels: { select: { label: { select: labelRefSelect } } },
    subtasks: { select: { title: true }, orderBy: { position: "asc" } },
    team: {
      select: {
        id: true,
        name: true,
        // Limited to the current user, for their role.
        memberships: { where: { userId }, select: { role: true } },
      },
    },
  }) as const;

type SummaryRow = Prisma.TaskTemplateGetPayload<{ select: ReturnType<typeof summarySelect> }>;

function toSummary(row: SummaryRow, userId: string): TemplateSummary {
  const role = row.team?.memberships[0]?.role;
  const { assignee } = row;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueOffsetDays: row.dueOffsetDays,
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email, avatar: toAvatarRef(assignee) }
      : null,
    labels: sortLabels(row.labels.map(({ label }) => toLabelRef(label))),
    subtasks: row.subtasks.map((subtask) => subtask.title),
    team: row.team ? { id: row.team.id, name: row.team.name } : null,
    canManage: row.team ? role === TeamRole.OWNER || role === TeamRole.ADMIN : row.ownerId === userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const byName = [{ nameKey: "asc" as const }, { id: "asc" as const }];

/**
 * Reads a template together with its labels and subtasks as of one moment.
 * Prisma fetches related rows in separate statements, so without this a label
 * or a whole template deleted in between could be read half gone.
 */
const snapshot = <T>(read: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(read, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

/** Every template the user can use: their personal ones and those of each team they are in, by name. */
export async function listTemplatesForUser(userId: string): Promise<TemplateSummary[]> {
  const rows = await snapshot((tx) =>
    tx.taskTemplate.findMany({ where: templateAccessWhere(userId), select: summarySelect(userId), orderBy: byName }),
  );

  return rows.map((row) => toSummary(row, userId));
}

/** Null when the template doesn't exist or isn't accessible to this user: the same answer for both. */
export async function getTemplateById(userId: string, templateId: string): Promise<TemplateSummary | null> {
  if (templateId.length > 100) return null;

  const row = await snapshot((tx) =>
    tx.taskTemplate.findFirst({
      where: { AND: [{ id: templateId }, templateAccessWhere(userId)] },
      select: summarySelect(userId),
    }),
  );

  return row ? toSummary(row, userId) : null;
}

export type TemplateError =
  | "template-not-found"
  | "template-workspace-not-found"
  | "template-forbidden"
  | "template-duplicate"
  | "template-limit"
  | "template-no-time-zone";

type AssignmentError = "assign-forbidden" | "invalid-assignee";
type SaveError = TemplateError | AssignmentError | Extract<LabelError, "label-not-found">;

const isCode = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/** The team's workspace if the user is a member of it, their own otherwise; null for a team they aren't in. */
async function resolveScope(userId: string, teamId: string | undefined): Promise<LabelScope | null> {
  if (!teamId) return { ownerId: userId, teamId: null };

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { id: true },
  });

  return membership ? { ownerId: null, teamId } : null;
}

/**
 * Whether a template of this workspace may hold these references. An assignee
 * follows the task rule (checkAssignment): only in a team, only set by its
 * owner or admins, only a member of it. Labels must be labels of the workspace;
 * any other, like one that doesn't exist, is "label-not-found".
 */
async function checkReferences(
  userId: string,
  scope: LabelScope,
  assigneeId: string | null | undefined,
  labelIds: readonly string[] | undefined,
): Promise<AssignmentError | "label-not-found" | null> {
  if (assigneeId) {
    const problem = await checkAssignment(userId, scope.teamId, assigneeId);
    if (problem) return problem;
  }

  if (labelIds && !(await labelsInScope(prisma, scope, labelIds))) return "label-not-found";

  return null;
}

const labelRows = (labelIds: readonly string[]) => labelIds.map((labelId) => ({ labelId }));
const subtaskRows = (titles: readonly string[]) => titles.map((title, position) => ({ title, position }));

async function insertTemplate(userId: string, scope: LabelScope, fields: TemplateFields) {
  const { labelIds, subtasks, name, ...columns } = fields;

  return prisma.taskTemplate.create({
    data: {
      ...columns,
      ...scope,
      name,
      nameKey: templateNameKey(name),
      labels: { create: labelRows(labelIds) },
      subtasks: { create: subtaskRows(subtasks) },
    },
    select: summarySelect(userId),
  });
}

const atLimit = async (scope: LabelScope) =>
  (await prisma.taskTemplate.count({ where: scopeWhere(scope) })) >= MAX_TEMPLATES_PER_WORKSPACE;

/**
 * Creates a template in the user's personal workspace or in a team they belong
 * to. "template-workspace-not-found" is the same for a team that doesn't exist
 * and one that isn't theirs.
 */
export async function createTemplate(
  userId: string,
  input: TemplateInput,
): Promise<{ template: TemplateSummary } | { error: SaveError }> {
  const { teamId, ...fields } = input;
  const scope = await resolveScope(userId, teamId);

  if (!scope) return { error: "template-workspace-not-found" };

  const problem = await checkReferences(userId, scope, fields.assigneeId, fields.labelIds);
  if (problem) return { error: problem };

  if (await atLimit(scope)) return { error: "template-limit" };

  try {
    return { template: toSummary(await insertTemplate(userId, scope, fields), userId) };
  } catch (error) {
    // The unique (workspace, name) index: also what stops two simultaneous requests both creating it.
    if (isCode(error, "P2002")) return { error: "template-duplicate" };
    // A label or the assignee was deleted between the check and the write.
    if (isCode(error, "P2003")) return { error: "label-not-found" };

    throw error;
  }
}

/** "template-not-found" for one that doesn't exist or isn't visible; "template-forbidden" for one the user may use but not change. */
async function manageable(userId: string, templateId: string): Promise<TemplateError | null> {
  if (templateId.length > 100) return "template-not-found";

  if ((await prisma.taskTemplate.count({ where: { AND: [{ id: templateId }, templateManageWhere(userId)] } })) > 0) {
    return null;
  }

  return (await prisma.taskTemplate.count({ where: { AND: [{ id: templateId }, templateAccessWhere(userId)] } })) > 0
    ? "template-forbidden"
    : "template-not-found";
}

/** Changes the fields given. Tasks already created from the template are not touched: they hold no reference to it. */
export async function updateTemplate(
  userId: string,
  templateId: string,
  input: Partial<TemplateFields>,
): Promise<{ template: TemplateSummary } | { error: SaveError }> {
  const problem = await manageable(userId, templateId);
  if (problem) return { error: problem };

  const current = await prisma.taskTemplate.findFirst({
    where: { AND: [{ id: templateId }, templateManageWhere(userId)] },
    select: { ownerId: true, teamId: true, assigneeId: true },
  });
  const scope = current && scopeOfProject(current);

  if (!current || !scope) return { error: "template-not-found" };

  const { labelIds, subtasks, name, ...columns } = input;
  // As with a task, only an actual change of assignee is checked; saving the one it has always works.
  const reference = await checkReferences(
    userId,
    scope,
    columns.assigneeId !== current.assigneeId ? columns.assigneeId : null,
    labelIds,
  );
  if (reference) return { error: reference };

  try {
    const written = await prisma.$transaction(async (tx) => {
      // The permission is part of the statement, so it still holds at the moment of the write. It also
      // takes the row's lock, which puts simultaneous edits of one template's labels and subtasks in a queue.
      const { count } = await tx.taskTemplate.updateMany({
        where: { AND: [{ id: templateId }, templateManageWhere(userId)] },
        data: {
          ...columns,
          ...(name !== undefined ? { name, nameKey: templateNameKey(name) } : {}),
          updatedAt: new Date(),
        },
      });

      if (count === 0) return false;

      if (labelIds !== undefined) {
        await tx.taskTemplateLabel.deleteMany({ where: { templateId } });
        await tx.taskTemplateLabel.createMany({ data: labelRows(labelIds).map((row) => ({ ...row, templateId })) });
      }

      if (subtasks !== undefined) {
        await tx.taskTemplateSubtask.deleteMany({ where: { templateId } });
        await tx.taskTemplateSubtask.createMany({ data: subtaskRows(subtasks).map((row) => ({ ...row, templateId })) });
      }

      return true;
    });

    if (!written) return { error: "template-not-found" };
  } catch (error) {
    if (isCode(error, "P2002")) return { error: "template-duplicate" };
    if (isCode(error, "P2003")) return { error: "label-not-found" };

    throw error;
  }

  const template = await getTemplateById(userId, templateId);

  return template ? { template } : { error: "template-not-found" };
}

/** Deletes a template with its label links and subtask titles. No task is deleted or changed. */
export async function deleteTemplate(userId: string, templateId: string): Promise<"deleted" | TemplateError> {
  const problem = await manageable(userId, templateId);
  if (problem) return problem;

  const { count } = await prisma.taskTemplate.deleteMany({
    where: { AND: [{ id: templateId }, templateManageWhere(userId)] },
  });

  return count > 0 ? "deleted" : "template-not-found";
}

/** "Name (copy)", then "Name (copy 2)"…: the first one not taken, shortened to fit when the name is long. */
function copyName(name: string, taken: ReadonlySet<string>) {
  for (let number = 1; ; number++) {
    const suffix = number === 1 ? " (copy)" : ` (copy ${number})`;
    const candidate = `${name.slice(0, TEMPLATE_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;

    if (!taken.has(templateNameKey(candidate))) return candidate;
  }
}

/**
 * Copies a template the user can see into the same workspace, as a new
 * template under another name. Anyone who may create templates there may do
 * this. The assignee is copied only if this user could have set it themselves.
 */
export async function duplicateTemplate(
  userId: string,
  templateId: string,
  name?: string,
): Promise<{ template: TemplateSummary } | { error: SaveError }> {
  // A copy name taken by a simultaneous duplicate is simply chosen again.
  for (let attempt = 0; ; attempt++) {
    const source = templateId.length > 100 ? null : await snapshot((tx) =>
      tx.taskTemplate.findFirst({
        where: { AND: [{ id: templateId }, templateAccessWhere(userId)] },
        select: {
          name: true,
          description: true,
          status: true,
          priority: true,
          dueOffsetDays: true,
          assigneeId: true,
          ownerId: true,
          teamId: true,
          labels: { select: { labelId: true } },
          subtasks: { select: { title: true }, orderBy: { position: "asc" } },
        },
      }),
    );
    const scope = source && scopeOfProject(source);

    if (!source || !scope) return { error: "template-not-found" };
    if (await atLimit(scope)) return { error: "template-limit" };

    const taken = name
      ? null
      : await prisma.taskTemplate.findMany({ where: scopeWhere(scope), select: { nameKey: true } });
    const keepAssignee =
      source.assigneeId !== null && (await checkAssignment(userId, scope.teamId, source.assigneeId)) === null;

    try {
      const row = await insertTemplate(userId, scope, {
        name: name ?? copyName(source.name, new Set(taken?.map((template) => template.nameKey))),
        description: source.description,
        status: source.status,
        priority: source.priority,
        dueOffsetDays: source.dueOffsetDays,
        assigneeId: keepAssignee ? source.assigneeId : null,
        labelIds: source.labels.map((link) => link.labelId),
        subtasks: source.subtasks.map((subtask) => subtask.title),
      });

      return { template: toSummary(row, userId) };
    } catch (error) {
      // A given name that is taken is the caller's to change; a label deleted meanwhile is gone on the next read.
      const retry = (isCode(error, "P2002") && !name) || isCode(error, "P2003");

      if (isCode(error, "P2002") && name) return { error: "template-duplicate" };
      if (!retry || attempt >= 4) throw error;
    }
  }
}

/** What a template held that the new task didn't get, because it isn't valid where the task was created. */
export type TemplateSkipped = {
  /** The default assignee: not a member of the project's team, or this user may not assign there. */
  assignee: boolean;
  /** How many of the template's labels don't exist in the project's workspace. */
  labels: number;
};

type CreateTaskError = Extract<Awaited<ReturnType<typeof createTask>>, { error: unknown }>["error"];

export type TemplateUseResult =
  | { task: TaskSummary; subtasks: number; skipped: TemplateSkipped }
  | { error: TemplateError | CreateTaskError }
  | { invalid: string };

/**
 * Creates an ordinary task from a template, in a project the user chose and
 * can create tasks in. The template's values are starting values only, and
 * only the valid ones are used:
 *
 *  - labels: those that exist in the destination project's workspace;
 *  - the assignee: if still a member of the destination project's team, and
 *    this user may assign tasks there (otherwise the task starts unassigned);
 *  - the due date: `dueOffsetDays` days after today in the user's saved time
 *    zone (or the zone sent with the request when none is saved).
 *
 * A field given in `use.overrides` replaces the template's and is then held to
 * the same rules as in any new task. Everything is then validated and written
 * by createTask, so the task and its subtasks get fresh IDs, their own history
 * and the usual assignment notification. No ID, comment, history, reminder or
 * repeat schedule exists on a template to be copied.
 */
export async function createTaskFromTemplate(
  userId: string,
  templateId: string,
  use: TemplateUse,
): Promise<TemplateUseResult> {
  // A label deleted between reading the template and writing the task is gone on the next reading.
  for (let attempt = 0; ; attempt++) {
    const template = templateId.length > 100 ? null : await snapshot((tx) =>
      tx.taskTemplate.findFirst({
        where: { AND: [{ id: templateId }, templateAccessWhere(userId)] },
        select: {
          name: true,
          description: true,
          status: true,
          priority: true,
          dueOffsetDays: true,
          assigneeId: true,
          labels: { select: { labelId: true, label: { select: { ownerId: true, teamId: true } } } },
          subtasks: { select: { title: true }, orderBy: { position: "asc" } },
        },
      }),
    );

    if (!template) return { error: "template-not-found" };

    const project = await findAccessibleProject(userId, use.projectId);

    if (!project) return { error: "project-not-found" };

    const { overrides } = use;
    const scope = scopeOfProject(project);
    const labelIds = template.labels.filter((link) => scope && inScope(link.label, scope)).map((link) => link.labelId);
    const assignable =
      template.assigneeId !== null &&
      !("assigneeId" in overrides) &&
      (await checkAssignment(userId, project.teamId, template.assigneeId)) === null;
    let dueDate: string | undefined;

    if (template.dueOffsetDays !== null && !("dueDate" in overrides)) {
      const timeZone = (await accountTimeZone(userId)) ?? use.timeZone;

      if (!timeZone) return { error: "template-no-time-zone" };

      dueDate = dueDateForOffset(template.dueOffsetDays, timeZone, new Date())?.toISOString();
    }

    const result = validateTaskInput({
      title: template.name,
      description: template.description,
      status: template.status,
      priority: template.priority,
      ...(assignable ? { assigneeId: template.assigneeId } : {}),
      ...(labelIds.length > 0 ? { labelIds } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...overrides,
      ...(use.timeZone ? { timeZone: use.timeZone } : {}),
      // Always the chosen project, and always a top-level task.
      projectId: project.id,
    });

    if ("error" in result) return { invalid: result.error };

    try {
      const outcome = await createTask(userId, result.data, {
        subtaskTitles: template.subtasks.map((subtask) => subtask.title),
      });

      if ("error" in outcome) {
        // One of the template's own labels has just been deleted: read the template again, without it.
        if (outcome.error === "label-not-found" && !("labelIds" in overrides) && labelIds.length > 0 && attempt < 2) continue;

        return outcome;
      }

      return {
        task: outcome.task,
        subtasks: template.subtasks.length,
        skipped: {
          assignee: template.assigneeId !== null && !("assigneeId" in overrides) && !assignable,
          labels: "labelIds" in overrides ? 0 : template.labels.length - labelIds.length,
        },
      };
    } catch (error) {
      if (!isCode(error, "P2003") || attempt >= 2) throw error;
    }
  }
}
