// Shared by the template API and the template forms, so it must stay free of server-only imports.
//
// A task template holds the values a new task starts with. Its name is the
// new task's title unless another one is given when it is used.
import { addDays, dayKeyOf, dueDateFromInput } from "@/lib/calendar-dates";
import { labelNameKey, normalizeLabelName, validateLabelIds } from "@/lib/label-rules";
import { validateReminderTimeZone } from "@/lib/reminder-rules";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX_LENGTH,
  validateAssigneeId,
  validateDescription,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";

export const TEMPLATE_NAME_MAX_LENGTH = 100;
/** The most subtasks one template can list. prisma/migrations has a matching CHECK on the position. */
export const MAX_TEMPLATE_SUBTASKS = 20;
/** The most templates one workspace (a person's, or a team's) can have. */
export const MAX_TEMPLATES_PER_WORKSPACE = 100;
/** The furthest ahead a template's due date can be, in days after the day it is used. */
export const MAX_DUE_OFFSET_DAYS = 365;

type ValidationResult<T> = { data: T } | { error: string };

/** The name as it is stored and shown, and as it is compared: the same folding as label names. */
export const normalizeTemplateName = normalizeLabelName;
export const templateNameKey = labelNameKey;

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100;

function validateName(value: unknown): ValidationResult<string> {
  const name = typeof value === "string" ? normalizeTemplateName(value) : "";

  if (!name) return { error: "Enter a template name." };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: "A template name can't contain control characters." };

  if (name.length > TEMPLATE_NAME_MAX_LENGTH || templateNameKey(name).length > TEMPLATE_NAME_MAX_LENGTH) {
    return { error: `A template name must be ${TEMPLATE_NAME_MAX_LENGTH} characters or fewer.` };
  }

  return { data: name };
}

/** A whole number of days, or null (also "" from a form) for a template without a due date. */
function validateDueOffset(value: unknown): ValidationResult<number | null> {
  if (value === null || value === undefined || value === "") return { data: null };

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_DUE_OFFSET_DAYS) {
    return { error: `Choose a due date between 0 and ${MAX_DUE_OFFSET_DAYS} days after the task is created.` };
  }

  return { data: value };
}

/** Titles in order. Each is checked like a task title; repeats are allowed, as two tasks may share a title. */
function validateSubtasks(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value) || !value.every((title) => typeof title === "string")) {
    return { error: "Subtasks must be a list of titles." };
  }

  const titles = (value as string[]).map((title) => title.trim());

  if (titles.length > MAX_TEMPLATE_SUBTASKS) {
    return { error: `A template can have at most ${MAX_TEMPLATE_SUBTASKS} subtasks.` };
  }

  if (titles.some((title) => !title)) return { error: "Enter a title for every subtask, or remove the empty one." };

  if (titles.some((title) => title.length > TASK_TITLE_MAX_LENGTH)) {
    return { error: `A subtask title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.` };
  }

  return { data: titles };
}

/** What a template holds, apart from the workspace it is in. */
export type TemplateFields = {
  name: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  /** Days after the day the task is created; null = no due date. */
  dueOffsetDays: number | null;
  /** Team templates only. Whether that person may be the assignee is decided on the server. */
  assigneeId: string | null;
  /** Labels of the template's own workspace; the server checks that. */
  labelIds: string[];
  /** Subtask titles, in order. */
  subtasks: string[];
};

/** A new template. With no teamId it is one of the user's personal templates. */
export type TemplateInput = TemplateFields & { teamId?: string };

const isStatus = (value: unknown): value is TaskStatusValue => TASK_STATUSES.includes(value as TaskStatusValue);
const isPriority = (value: unknown): value is TaskPriorityValue => TASK_PRIORITIES.includes(value as TaskPriorityValue);

/** The fields present in the body, each validated. Shared by create (where the missing ones get defaults) and update. */
function validateFields(payload: Record<string, unknown>): ValidationResult<Partial<TemplateFields>> {
  const data: Partial<TemplateFields> = {};

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

  if ("status" in payload) {
    if (!isStatus(payload.status)) return { error: "Choose a valid status." };
    data.status = payload.status;
  }

  if ("priority" in payload) {
    if (!isPriority(payload.priority)) return { error: "Choose a valid priority." };
    data.priority = payload.priority;
  }

  if ("dueOffsetDays" in payload) {
    const offset = validateDueOffset(payload.dueOffsetDays);
    if ("error" in offset) return offset;
    data.dueOffsetDays = offset.data;
  }

  if ("assigneeId" in payload) {
    const assigneeId = validateAssigneeId(payload.assigneeId);
    if ("error" in assigneeId) return assigneeId;
    data.assigneeId = assigneeId.data;
  }

  if ("labelIds" in payload) {
    const labelIds = validateLabelIds(payload.labelIds ?? []);
    if ("error" in labelIds) return labelIds;
    data.labelIds = labelIds.data;
  }

  if ("subtasks" in payload) {
    const subtasks = validateSubtasks(payload.subtasks ?? []);
    if ("error" in subtasks) return subtasks;
    data.subtasks = subtasks.data;
  }

  return { data };
}

/** Validates a new template. Whether the user may add to that workspace is decided on the server. */
export function validateTemplateInput(body: unknown): ValidationResult<TemplateInput> {
  const payload = asObject(body);

  if (!payload) return { error: "Enter a template name." };

  const name = validateName(payload.name);
  if ("error" in name) return name;

  const fields = validateFields(payload);
  if ("error" in fields) return fields;

  const data: TemplateInput = {
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    dueOffsetDays: null,
    assigneeId: null,
    labelIds: [],
    subtasks: [],
    ...fields.data,
    name: name.data,
  };

  if (payload.teamId !== undefined && payload.teamId !== null && payload.teamId !== "") {
    if (!validId(payload.teamId)) return { error: "Choose a valid team." };
    data.teamId = payload.teamId;
  }

  return { data };
}

/** Validates a change to a template; only the fields present are changed. A template never changes workspace. */
export function validateTemplateUpdate(body: unknown): ValidationResult<Partial<TemplateFields>> {
  const payload = asObject(body);

  if (!payload) return { error: "Request body must be a JSON object." };

  const fields = validateFields(payload);
  if ("error" in fields) return fields;

  if (Object.keys(fields.data).length === 0) return { error: "Nothing to update." };

  return fields;
}

/** Validates the optional `{ "name": string }` of a duplicate request; without one the server picks "… (copy)". */
export function validateTemplateDuplicate(body: unknown): ValidationResult<{ name?: string }> {
  const payload = asObject(body);

  if (!payload || payload.name === undefined || payload.name === null) return { data: {} };

  const name = validateName(payload.name);

  return "error" in name ? name : { data: { name: name.data } };
}

/**
 * The task fields a "create task from template" request may set itself; each
 * one given replaces the template's value and is then checked exactly as in an
 * ordinary new task. Anything else in the body (IDs, owners, a parent) is ignored.
 */
export const TEMPLATE_TASK_OVERRIDES = [
  "title",
  "description",
  "status",
  "priority",
  "assigneeId",
  "dueDate",
  "labelIds",
  "recurrence",
  "reminders",
] as const;

export type TemplateUse = {
  projectId: string;
  /** The requester's IANA zone, used only when their account has none saved. */
  timeZone?: string;
  overrides: Partial<Record<(typeof TEMPLATE_TASK_OVERRIDES)[number], unknown>>;
};

/** Validates the envelope of a "create task from template" request; the task itself is validated once it is put together. */
export function validateTemplateUse(body: unknown): ValidationResult<TemplateUse> {
  const payload = asObject(body);
  const projectId = typeof payload?.projectId === "string" ? payload.projectId.trim() : "";

  if (!payload || !projectId || projectId.length > 100) {
    return { error: "Choose a project for this task." };
  }

  const timeZone = validateReminderTimeZone(payload.timeZone);
  if ("error" in timeZone) return timeZone;

  const overrides: TemplateUse["overrides"] = {};

  for (const key of TEMPLATE_TASK_OVERRIDES) {
    if (key in payload) overrides[key] = payload[key];
  }

  return { data: { projectId, ...(timeZone.data ? { timeZone: timeZone.data } : {}), overrides } };
}

/**
 * The due date a template gives a task created at `now`: the end of the day
 * `days` calendar days after today in `timeZone` (a date without a time, like
 * one picked in the task form). Counted on the calendar, so a clock change in
 * between never moves it to another day.
 */
export function dueDateForOffset(days: number, timeZone: string, now: Date): Date | null {
  return dueDateFromInput(addDays(dayKeyOf(now, timeZone), days), "", timeZone);
}

/** "No due date", "Due the day it is created", "Due 3 days after it is created". */
export function describeDueOffset(days: number | null) {
  if (days === null) return "No due date";
  if (days === 0) return "Due the day it is created";

  return `Due ${days} ${days === 1 ? "day" : "days"} after it is created`;
}
