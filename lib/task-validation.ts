// Shared by the API routes and the Create Task dialog, so it must stay free of server-only imports.
// The string values mirror the TaskStatus/TaskPriority enums in prisma/schema.prisma.
import { isDayKey, MAX_CALENDAR_YEAR, MIN_CALENDAR_YEAR } from "@/lib/calendar-dates";
import { validateLabelIds } from "@/lib/label-rules";
import { validateRecurrenceInput, type RecurrenceInput } from "@/lib/recurrence-rules";
import { validateReminderOffsets, validateReminderTimeZone, type ReminderOffset } from "@/lib/reminder-rules";

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number];
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export const taskStatusLabels: Record<TaskStatusValue, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  COMPLETED: "Completed",
};

export const taskPriorityLabels: Record<TaskPriorityValue, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export type TaskInput = {
  title: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  projectId: string;
  /** Absent = leave as is (or unassigned for a new task); null = unassigned. */
  assigneeId?: string | null;
  /** An ISO instant. Absent = leave as is (or none for a new task); null = no due date. */
  dueDate?: string | null;
  /** The parent of a subtask. Absent = leave as is (or top-level for a new task); null = top-level. */
  parentTaskId?: string | null;
  /**
   * The repeat schedule. Absent = leave as is (or none for a new task); null = turn repeating off.
   * Whether the task may repeat is decided in lib/tasks.ts.
   */
  recurrence?: RecurrenceInput | null;
  /**
   * The requester's own reminders on the task, as minutes before the due date. Absent = leave as is
   * (or none for a new task); a list replaces them, and an empty list removes them all.
   */
  reminders?: ReminderOffset[];
  /**
   * The task's labels, as label IDs. Absent = leave as is (or none for a new task); a list replaces
   * them, and an empty list removes them all. Which labels the task may carry is decided in lib/tasks.ts.
   */
  labelIds?: string[];
  /** The requester's IANA zone, used for reminders (and a schedule) only when their account has none saved. */
  timeZone?: string;
};

type ValidationResult<T> = { data: T } | { error: string };

const isStatus = (value: unknown): value is TaskStatusValue =>
  TASK_STATUSES.includes(value as TaskStatusValue);
const isPriority = (value: unknown): value is TaskPriorityValue =>
  TASK_PRIORITIES.includes(value as TaskPriorityValue);

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function validateTitle(value: unknown): ValidationResult<string> {
  const title = typeof value === "string" ? value.trim() : "";

  if (!title) {
    return { error: "Enter a task title." };
  }

  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return { error: `Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.` };
  }

  return { data: title };
}

export function validateDescription(value: unknown): ValidationResult<string | null> {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return { error: "Description must be text." };
  }

  const description = (value ?? "").trim();

  if (description.length > TASK_DESCRIPTION_MAX_LENGTH) {
    return { error: `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer.` };
  }

  return { data: description || null };
}

/**
 * Only the shape is checked here. Whether that user may actually be assigned
 * (a member of the project's team) and whether the requester may assign is
 * decided on the server in lib/tasks.ts.
 */
export function validateAssigneeId(value: unknown): ValidationResult<string | null> {
  if (value === null || value === "") {
    return { data: null };
  }

  if (typeof value !== "string" || value.length > 100) {
    return { error: "Choose a valid assignee." };
  }

  return { data: value };
}

/**
 * Only the shape is checked here. That the parent exists, is accessible, is in
 * the same project and is itself a top-level task is decided in lib/tasks.ts.
 */
function validateParentTaskId(value: unknown): ValidationResult<string | null> {
  if (value === null || value === "") {
    return { data: null };
  }

  if (typeof value !== "string" || value.length > 100) {
    return { error: "Choose a valid parent task." };
  }

  return { data: value };
}

// A full ISO instant with an explicit zone, so the server never has to guess one.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Returns the instant in canonical form (UTC, to the second), so equal due dates compare equal as strings. */
function validateDueDate(value: unknown): ValidationResult<string | null> {
  if (value === null || value === "") {
    return { data: null };
  }

  // The date part must be a real one: Date.parse would quietly turn 30 February into 2 March.
  const time =
    typeof value === "string" && ISO_INSTANT.test(value) && isDayKey(value.slice(0, 10)) ? Date.parse(value) : NaN;

  if (Number.isNaN(time)) {
    return { error: "Choose a valid due date." };
  }

  const date = new Date(Math.floor(time / 1000) * 1000);

  if (date.getUTCFullYear() < MIN_CALENDAR_YEAR || date.getUTCFullYear() > MAX_CALENDAR_YEAR) {
    return { error: `Choose a due date between ${MIN_CALENDAR_YEAR} and ${MAX_CALENDAR_YEAR}.` };
  }

  return { data: date.toISOString() };
}

/** Validates a new task. Project access is checked separately on the server. */
export function validateTaskInput(body: unknown): ValidationResult<TaskInput> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Enter a task title." };
  }

  const title = validateTitle(payload.title);
  if ("error" in title) return title;

  const description = validateDescription(payload.description);
  if ("error" in description) return description;

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  if (!projectId) {
    return { error: "Choose a project for this task." };
  }

  const status = payload.status ?? "TODO";
  if (!isStatus(status)) {
    return { error: "Choose a valid status." };
  }

  const priority = payload.priority ?? "MEDIUM";
  if (!isPriority(priority)) {
    return { error: "Choose a valid priority." };
  }

  const data: TaskInput = { title: title.data, description: description.data, status, priority, projectId };

  if ("assigneeId" in payload) {
    const assigneeId = validateAssigneeId(payload.assigneeId);
    if ("error" in assigneeId) return assigneeId;
    data.assigneeId = assigneeId.data;
  }

  if ("dueDate" in payload) {
    const dueDate = validateDueDate(payload.dueDate);
    if ("error" in dueDate) return dueDate;
    data.dueDate = dueDate.data;
  }

  if ("parentTaskId" in payload) {
    const parentTaskId = validateParentTaskId(payload.parentTaskId);
    if ("error" in parentTaskId) return parentTaskId;
    data.parentTaskId = parentTaskId.data;
  }

  // "recurrence": null on a new task simply means it doesn't repeat.
  if (payload.recurrence !== undefined && payload.recurrence !== null) {
    const recurrence = validateRecurrenceInput(payload.recurrence);
    if ("error" in recurrence) return recurrence;
    data.recurrence = recurrence.data;
  }

  if (payload.labelIds !== undefined && payload.labelIds !== null) {
    const labelIds = validateLabelIds(payload.labelIds);
    if ("error" in labelIds) return labelIds;
    data.labelIds = labelIds.data;
  }

  if (payload.reminders !== undefined && payload.reminders !== null) {
    const reminders = validateReminderOffsets(payload.reminders);
    if ("error" in reminders) return reminders;
    data.reminders = reminders.data;
  }

  if ("timeZone" in payload) {
    const timeZone = validateReminderTimeZone(payload.timeZone);
    if ("error" in timeZone) return timeZone;
    if (timeZone.data) data.timeZone = timeZone.data;
  }

  return { data };
}

/** Validates a partial update; only the fields present in the body are changed. */
export function validateTaskUpdate(body: unknown): ValidationResult<Partial<TaskInput>> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Request body must be a JSON object." };
  }

  const data: Partial<TaskInput> = {};

  if ("title" in payload) {
    const title = validateTitle(payload.title);
    if ("error" in title) return title;
    data.title = title.data;
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

  if ("projectId" in payload) {
    const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
    if (!projectId) return { error: "Choose a project for this task." };
    data.projectId = projectId;
  }

  if ("assigneeId" in payload) {
    const assigneeId = validateAssigneeId(payload.assigneeId);
    if ("error" in assigneeId) return assigneeId;
    data.assigneeId = assigneeId.data;
  }

  if ("dueDate" in payload) {
    const dueDate = validateDueDate(payload.dueDate);
    if ("error" in dueDate) return dueDate;
    data.dueDate = dueDate.data;
  }

  if ("parentTaskId" in payload) {
    const parentTaskId = validateParentTaskId(payload.parentTaskId);
    if ("error" in parentTaskId) return parentTaskId;
    data.parentTaskId = parentTaskId.data;
  }

  if ("recurrence" in payload) {
    if (payload.recurrence === null) {
      data.recurrence = null;
    } else {
      const recurrence = validateRecurrenceInput(payload.recurrence);
      if ("error" in recurrence) return recurrence;
      data.recurrence = recurrence.data;
    }
  }

  if (payload.labelIds !== undefined) {
    const labelIds = validateLabelIds(payload.labelIds);
    if ("error" in labelIds) return labelIds;
    data.labelIds = labelIds.data;
  }

  if (payload.reminders !== undefined) {
    const reminders = validateReminderOffsets(payload.reminders);
    if ("error" in reminders) return reminders;
    data.reminders = reminders.data;
  }

  if ("timeZone" in payload) {
    const timeZone = validateReminderTimeZone(payload.timeZone);
    if ("error" in timeZone) return timeZone;
    if (timeZone.data) data.timeZone = timeZone.data;
  }

  // A time zone alone changes nothing.
  if (Object.keys(data).filter((key) => key !== "timeZone").length === 0) {
    return { error: "Nothing to update." };
  }

  return { data };
}

/** Which side of a dependency the other task is on, seen from the task being edited. */
export const DEPENDENCY_RELATIONS = ["blocked-by", "blocks"] as const;
export type DependencyRelation = (typeof DEPENDENCY_RELATIONS)[number];

export const dependencyRelationLabels: Record<DependencyRelation, string> = {
  "blocked-by": "Blocked by",
  blocks: "Blocks",
};

export type DependencyInput = { relation: DependencyRelation; taskId: string };

/** Validates a new dependency's shape; which tasks may be linked is decided in lib/dependencies.ts. */
export function validateDependencyInput(body: unknown): ValidationResult<DependencyInput> {
  const payload = asObject(body);
  const relation = payload?.relation;
  const taskId = typeof payload?.taskId === "string" ? payload.taskId.trim() : "";

  if (!DEPENDENCY_RELATIONS.includes(relation as DependencyRelation)) {
    return { error: "Choose whether this task is blocked by, or blocks, the other task." };
  }

  if (!taskId || taskId.length > 100) {
    return { error: "Choose a task for this dependency." };
  }

  return { data: { relation: relation as DependencyRelation, taskId } };
}
