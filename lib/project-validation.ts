// Shared by the API routes and the project dialog, so it must stay free of server-only imports.
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;

export type ProjectInput = { name: string; description: string | null };
/** teamId is null for a personal project. Team access is checked separately on the server. */
export type ProjectCreateInput = ProjectInput & { teamId: string | null };

type ValidationResult<T> = { data: T } | { error: string };

function asObject(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function validateName(value: unknown): ValidationResult<string> {
  const name = typeof value === "string" ? value.trim() : "";

  if (!name) {
    return { error: "Enter a project name." };
  }

  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return { error: `Project name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer.` };
  }

  return { data: name };
}

function validateDescription(value: unknown): ValidationResult<string | null> {
  const description = typeof value === "string" ? value.trim() : "";

  if (description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    return {
      error: `Description must be ${PROJECT_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { data: description || null };
}

export function validateProjectInput(body: unknown): ValidationResult<ProjectCreateInput> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Enter a project name." };
  }

  const name = validateName(payload.name);
  if ("error" in name) return name;

  const description = validateDescription(payload.description);
  if ("error" in description) return description;

  const teamId = typeof payload.teamId === "string" ? payload.teamId.trim() : "";

  return { data: { name: name.data, description: description.data, teamId: teamId || null } };
}

/** Validates a partial update (name and description; a project can't change teams); only the fields present in the body are changed. */
export function validateProjectUpdate(body: unknown): ValidationResult<Partial<ProjectInput>> {
  const payload = asObject(body);

  if (!payload) {
    return { error: "Request body must be a JSON object." };
  }

  const data: Partial<ProjectInput> = {};

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
