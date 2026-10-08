// Shared by the API routes and the account forms (signup, settings), so it must
// stay free of server-only imports. One rule for a name wherever one is accepted.
export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;

type Result<T> = { data: T } | { error: string };

const asRecord = (body: unknown) =>
  body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

/** Trims the name; never truncates it. */
export function validateName(value: unknown): Result<string> {
  const name = typeof value === "string" ? value.trim() : "";

  if (!name) {
    return { error: "Enter your name." };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return { error: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  return { data: name };
}

/** Only `name` is read; any other field (userId, email, …) is ignored. */
export function validateProfileInput(body: unknown): Result<{ name: string }> {
  const record = asRecord(body);
  if (!record) return { error: "Enter your name." };

  const name = validateName(record.name);

  return "error" in name ? name : { data: { name: name.data } };
}

export type PasswordChange = { currentPassword: string; newPassword: string };

/** Shape and rules only; whether the current password is right is checked on the server. */
export function validatePasswordChangeInput(body: unknown): Result<PasswordChange> {
  const record = asRecord(body);
  const field = (key: string) => (record && typeof record[key] === "string" ? (record[key] as string) : "");
  const currentPassword = field("currentPassword");
  const newPassword = field("newPassword");
  const confirmPassword = field("confirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Fill in your current password, a new password and its confirmation." };
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { error: `Your new password must be at least ${PASSWORD_MIN_LENGTH} characters long.` };
  }

  if (newPassword !== confirmPassword) {
    return { error: "The new password and its confirmation don't match." };
  }

  if (newPassword === currentPassword) {
    return { error: "Choose a new password that is different from your current one." };
  }

  return { data: { currentPassword, newPassword } };
}

/**
 * The time zones a user may choose: "UTC" plus every IANA zone the runtime
 * knows. On the server this is the list that decides; the form gets the same
 * list from the page, so the two never disagree.
 */
export function supportedTimeZones(): string[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone")];
}

/** null clears the preference. Anything not in the IANA list (e.g. "+05:00") is rejected. */
export function validateTimeZoneInput(body: unknown, zones: readonly string[]): Result<{ timeZone: string | null }> {
  const record = asRecord(body);
  if (!record || !("timeZone" in record)) return { error: "Choose a time zone." };

  const value = record.timeZone;

  if (value === null || value === "") {
    return { data: { timeZone: null } };
  }

  if (typeof value !== "string" || value.length > 64 || !zones.includes(value.trim())) {
    return { error: "Choose a time zone from the list, such as Asia/Karachi or Europe/London." };
  }

  return { data: { timeZone: value.trim() } };
}
