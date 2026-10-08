import { NextResponse } from "next/server";

import { serverError as apiServerError } from "@/lib/api";
import { taskError } from "../tasks/_shared";

export { getSessionUserId, readJson } from "@/lib/api";

export const unauthorized = () =>
  NextResponse.json({ error: "You need to sign in to manage task templates." }, { status: 401 });

const conflict = (error: string) => () => NextResponse.json({ error }, { status: 409 });

const templateErrors = {
  // Deliberately identical for a template that doesn't exist and one this user can't see.
  "template-not-found": () => NextResponse.json({ error: "Template not found." }, { status: 404 }),
  "template-workspace-not-found": () => NextResponse.json({ error: "Team not found." }, { status: 404 }),
  "template-forbidden": () =>
    NextResponse.json({ error: "Only team owners and admins can change or delete a team's templates." }, { status: 403 }),
  "template-duplicate": conflict("A template with that name already exists here."),
  "template-limit": conflict("This workspace already has the most templates it can have (100). Delete one first."),
  "template-no-time-zone": () =>
    NextResponse.json(
      { error: "Choose a time zone in Settings, or send one with the request, so the due date can be worked out." },
      { status: 400 },
    ),
};

type TemplateErrorCode = keyof typeof templateErrors;

/** A template error, or any of the task errors that saving or using a template can run into. */
export const templateError = (code: TemplateErrorCode | Parameters<typeof taskError>[0]) =>
  code in templateErrors ? templateErrors[code as TemplateErrorCode]() : taskError(code as Parameters<typeof taskError>[0]);

/** Logs the real cause server-side and returns a safe message to the client. */
export const serverError = (action: string, error: unknown) => apiServerError("task-templates", action, error);
