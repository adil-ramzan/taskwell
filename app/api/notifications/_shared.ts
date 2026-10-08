import { jsonError, serverError as apiServerError } from "@/lib/api";

export { getSessionUserId } from "@/lib/api";

export const unauthorized = () => jsonError("You need to sign in to see your notifications.", 401);

// Deliberately identical for "doesn't exist" and "belongs to someone else".
export const notificationNotFound = () => jsonError("Notification not found.", 404);

/** Logs the real cause server-side and returns a safe message to the client. */
export const serverError = (action: string, error: unknown) => apiServerError("notifications", action, error);
