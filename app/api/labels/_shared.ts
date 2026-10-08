import { NextResponse } from "next/server";

import { serverError as apiServerError } from "@/lib/api";

export { getSessionUserId, readJson } from "@/lib/api";
export { taskError as labelError } from "../tasks/_shared";

export const unauthorized = () =>
  NextResponse.json({ error: "You need to sign in to manage labels." }, { status: 401 });

/** Logs the real cause server-side and returns a safe message to the client. */
export const serverError = (action: string, error: unknown) => apiServerError("labels", action, error);
