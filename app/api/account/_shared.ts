import { jsonError, serverError as apiServerError } from "@/lib/api";

export { getSessionUserId, jsonError, readJson } from "@/lib/api";

export const unauthorized = () => jsonError("You need to sign in to change your account.", 401);

/** Logs the real cause server-side (never the request body) and returns a safe message. */
export const serverError = (action: string, error: unknown) => apiServerError("account", action, error);
