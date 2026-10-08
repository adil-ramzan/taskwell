// Shared by the label API and the label UI, so it must stay free of server-only imports.

export const LABEL_NAME_MAX_LENGTH = 40;
/** The most labels one task can carry. */
export const MAX_LABELS_PER_TASK = 20;
/** The most labels one workspace (a person's, or a team's) can have. */
export const MAX_LABELS_PER_WORKSPACE = 100;

/** The palette. The keys are what is stored; prisma/migrations has a matching CHECK. */
export const LABEL_COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export const labelColorNames: Record<LabelColor, string> = {
  gray: "Gray",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
};

export const DEFAULT_LABEL_COLOR: LabelColor = "blue";

/** What a task, a filter or a picker shows of a label. */
export type LabelRef = { id: string; name: string; color: LabelColor };

/** How several chosen labels combine in a filter. */
export const LABEL_MATCH_MODES = ["any", "all"] as const;
export type LabelMatchMode = (typeof LABEL_MATCH_MODES)[number];

type ValidationResult<T> = { data: T } | { error: string };

export const isLabelColor = (value: unknown): value is LabelColor => LABEL_COLORS.includes(value as LabelColor);

/** The name as it is stored and shown: outer spaces removed, inner runs of white space made one space. */
export const normalizeLabelName = (name: string) => name.trim().replace(/\s+/g, " ");

/** The name as it is compared: two labels of one workspace can't share this. Case and accents-as-typed don't matter. */
export const labelNameKey = (name: string) => normalizeLabelName(name).normalize("NFKC").toLowerCase();

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function validateName(value: unknown): ValidationResult<string> {
  const name = typeof value === "string" ? normalizeLabelName(value) : "";

  if (!name) return { error: "Enter a label name." };
  // Control characters have no place in a name that is shown inline everywhere.
  if (/[\u0000-\u001f\u007f]/.test(name)) return { error: "A label name can't contain control characters." };

  if (name.length > LABEL_NAME_MAX_LENGTH || labelNameKey(name).length > LABEL_NAME_MAX_LENGTH) {
    return { error: `A label name must be ${LABEL_NAME_MAX_LENGTH} characters or fewer.` };
  }

  return { data: name };
}

const COLOR_ERROR = `Choose one of the label colors: ${LABEL_COLORS.join(", ")}.`;

const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 100;

export type LabelInput = {
  name: string;
  color: LabelColor;
  /** Where the label goes: a team's labels, the workspace of a project, or (neither given) the user's personal labels. */
  teamId?: string;
  projectId?: string;
};

/** Validates a new label. Whether the user may add to that workspace is decided on the server. */
export function validateLabelInput(body: unknown): ValidationResult<LabelInput> {
  const payload = asObject(body);

  if (!payload) return { error: "Enter a label name." };

  const name = validateName(payload.name);
  if ("error" in name) return name;

  const color = payload.color ?? DEFAULT_LABEL_COLOR;
  if (!isLabelColor(color)) return { error: COLOR_ERROR };

  const data: LabelInput = { name: name.data, color };
  const hasTeam = payload.teamId !== undefined && payload.teamId !== null && payload.teamId !== "";
  const hasProject = payload.projectId !== undefined && payload.projectId !== null && payload.projectId !== "";

  if (hasTeam && hasProject) return { error: "Give a team or a project for the label, not both." };

  if (hasTeam) {
    if (!validId(payload.teamId)) return { error: "Choose a valid team." };
    data.teamId = payload.teamId;
  }

  if (hasProject) {
    if (!validId(payload.projectId)) return { error: "Choose a valid project." };
    data.projectId = payload.projectId;
  }

  return { data };
}

export type LabelUpdate = { name?: string; color?: LabelColor };

/** Validates a change to a label; only the fields present are changed. A label never changes workspace. */
export function validateLabelUpdate(body: unknown): ValidationResult<LabelUpdate> {
  const payload = asObject(body);

  if (!payload) return { error: "Request body must be a JSON object." };

  const data: LabelUpdate = {};

  if ("name" in payload) {
    const name = validateName(payload.name);
    if ("error" in name) return name;
    data.name = name.data;
  }

  if ("color" in payload) {
    if (!isLabelColor(payload.color)) return { error: COLOR_ERROR };
    data.color = payload.color;
  }

  if (Object.keys(data).length === 0) return { error: "Nothing to update." };

  return { data };
}

/** Validates a task's whole set of labels: a list of IDs without repeats, possibly empty. */
export function validateLabelIds(value: unknown): ValidationResult<string[]> {
  if (!Array.isArray(value) || !value.every(validId)) {
    return { error: "Labels must be a list of label IDs." };
  }

  const ids = [...new Set(value)];

  if (ids.length > MAX_LABELS_PER_TASK) {
    return { error: `A task can have at most ${MAX_LABELS_PER_TASK} labels.` };
  }

  return { data: ids };
}

/** Validates `{ "labelId": "<id>" }`. */
export function validateLabelId(body: unknown): ValidationResult<string> {
  const labelId = asObject(body)?.labelId;

  return validId(labelId) ? { data: labelId } : { error: "Choose a label." };
}

/**
 * Whether a task passes a label filter. With nothing selected everything
 * passes. "any" = the task has at least one of the selected labels (OR);
 * "all" = it has every one of them (AND).
 */
export function matchesLabels(taskLabelIds: readonly string[], selected: readonly string[], mode: LabelMatchMode) {
  if (selected.length === 0) return true;

  return mode === "all"
    ? selected.every((id) => taskLabelIds.includes(id))
    : selected.some((id) => taskLabelIds.includes(id));
}
