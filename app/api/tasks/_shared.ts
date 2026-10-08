import { NextResponse } from "next/server";

import { serverError as apiServerError } from "@/lib/api";

export { getSessionUserId, readJson } from "@/lib/api";

export const unauthorized = () =>
  NextResponse.json({ error: "You need to sign in to manage tasks." }, { status: 401 });

// Deliberately identical for "doesn't exist" and "not accessible to this user".
export const taskNotFound = () => NextResponse.json({ error: "Task not found." }, { status: 404 });

export const projectNotFound = () =>
  NextResponse.json({ error: "Choose one of your projects for this task." }, { status: 404 });

export const assignForbidden = () =>
  NextResponse.json({ error: "Only team owners and admins can assign tasks." }, { status: 403 });

// Deliberately identical for an unknown user, a user outside the team, and a personal project.
export const invalidAssignee = () =>
  NextResponse.json({ error: "Choose a member of this project's team as the assignee." }, { status: 400 });

export const invalidCursor = () => NextResponse.json({ error: "Invalid cursor." }, { status: 400 });

const commentErrors = {
  "task-not-found": taskNotFound,
  // Also the answer for a comment that belongs to a different task.
  "comment-not-found": () => NextResponse.json({ error: "Comment not found." }, { status: 404 }),
  forbidden: () => NextResponse.json({ error: "You can only change your own comments." }, { status: 403 }),
};

export const commentError = (code: keyof typeof commentErrors) => commentErrors[code]();

const badRequest = (error: string) => () => NextResponse.json({ error }, { status: 400 });
const conflict = (error: string) => () => NextResponse.json({ error }, { status: 409 });

const taskErrors = {
  "task-not-found": taskNotFound,
  "project-not-found": projectNotFound,
  "assign-forbidden": assignForbidden,
  "invalid-assignee": invalidAssignee,
  // A parent that doesn't exist or isn't accessible: the same answer as any other such task.
  "parent-not-found": taskNotFound,
  "self-parent": badRequest("A task can't be its own subtask."),
  "nested-subtask": badRequest("A subtask can't have subtasks of its own. Choose a top-level task as the parent."),
  "parent-other-project": badRequest("A subtask must be in the same project as its parent task."),
  "has-subtasks": badRequest("This task has subtasks, so it can't become a subtask itself."),
  "move-subtask": conflict(
    "A subtask stays in its parent task's project. Detach it from its parent before moving it to another project.",
  ),
  "move-has-subtasks": conflict(
    "This task has subtasks, which must stay in the same project. Delete or detach them before moving it.",
  ),
  "move-has-dependencies": conflict(
    "This task has dependencies on tasks in this project. Remove them before moving it to another project.",
  ),
  "recurrence-subtask": conflict("Only a top-level task can repeat. Detach this subtask from its parent task first."),
  "recurring-subtask": conflict("A repeating task can't become a subtask. Turn off its repeat first."),
  "recurrence-completed": conflict("A completed task can't be set to repeat. Reopen it first."),
  "recurrence-limit-reached": conflict(
    "This task's series already has more occurrences than that. Choose a higher number of occurrences.",
  ),
  "recurrence-no-time-zone": badRequest("Choose a time zone in Settings, or send one with the repeat schedule."),
  "recurrence-no-occurrence": badRequest(
    "That schedule has no occurrence still to come. Choose a later end date, or give the task a due date.",
  ),
  "reminder-not-found": () => NextResponse.json({ error: "Reminder not found." }, { status: 404 }),
  "reminder-duplicate": conflict("You already have a reminder at that time for this task."),
  "reminder-completed": conflict("A completed task can't have a new reminder. Reopen it first."),
  "reminder-no-due-date": conflict("Give this task a due date before adding a reminder."),
  "reminder-past-due": conflict("This task's due date has already passed, so there is nothing left to remind you of."),
  // Deliberately identical for a label that doesn't exist, one of another workspace, and one the task doesn't carry.
  "label-not-found": () => NextResponse.json({ error: "Label not found." }, { status: 404 }),
  "label-workspace-not-found": () => NextResponse.json({ error: "Team or project not found." }, { status: 404 }),
  "label-forbidden": () =>
    NextResponse.json({ error: "Only team owners and admins can change or delete a team's labels." }, { status: 403 }),
  "label-duplicate": conflict("A label with that name already exists here."),
  "label-limit": conflict("This workspace already has the most labels it can have (100). Delete one first."),
  "labels-too-many": conflict("A task can have at most 20 labels."),
};

export const taskError = (code: keyof typeof taskErrors) => taskErrors[code]();

const timeErrors = {
  "task-not-found": taskNotFound,
  // Also the answer for an entry that belongs to a different task.
  "time-entry-not-found": () => NextResponse.json({ error: "Time entry not found." }, { status: 404 }),
  "time-forbidden": () => NextResponse.json({ error: "You can only change your own time entries." }, { status: 403 }),
  "time-no-timer": conflict("You have no timer running."),
  "time-running": conflict("This timer is still running. Stop it before changing the entry."),
  "time-in-future": badRequest("A time entry can't end in the future."),
};

export const timeError = (code: keyof typeof timeErrors) => timeErrors[code]();

const status = (error: string, code: number) => () => NextResponse.json({ error }, { status: code });

const attachmentErrors = {
  "task-not-found": taskNotFound,
  // Also the answer for an attachment that belongs to a different task.
  "attachment-not-found": status("Attachment not found.", 404),
  // The record exists but its file isn't on this server's disk.
  "attachment-missing-file": status("This file is no longer available.", 404),
  "attachment-forbidden": status("You can only delete files you attached.", 403),
  "attachment-duplicate": conflict("This file is already attached to this task."),
  "attachment-limit": conflict("This task already has the most files it can have (20). Delete one first."),
  "attachment-no-name": badRequest("This file has no usable name. Rename it and try again."),
  "attachment-empty": badRequest("This file is empty."),
  "attachment-too-large": status("Choose a file of 10 MB or less.", 413),
  "attachment-type": status(
    "This kind of file can't be attached. Allowed: images (PNG, JPG, GIF, WebP), PDF, text (TXT, MD, CSV, JSON), Word, Excel, PowerPoint and ZIP.",
    415,
  ),
  "attachment-content": status("This file's contents don't match its type. Check the file and try again.", 415),
};

export const attachmentError = (code: keyof typeof attachmentErrors) => attachmentErrors[code]();

export const hasSubtasks = conflict(
  "This task has subtasks. Delete them, or detach them from it, before deleting this task.",
);

const dependencyErrors = {
  // Deliberately identical whichever of the two tasks is missing or inaccessible.
  "task-not-found": taskNotFound,
  "self-dependency": badRequest("A task can't depend on itself."),
  "other-project": badRequest("Dependencies can only link tasks in the same project."),
  duplicate: conflict("These two tasks already have that dependency."),
  cycle: conflict(
    "That would create a circular dependency: these tasks would end up waiting for each other, directly or through other tasks.",
  ),
};

export const dependencyError = (code: keyof typeof dependencyErrors) => dependencyErrors[code]();

// Also the answer for a dependency that belongs to a different task.
export const dependencyNotFound = () => NextResponse.json({ error: "Dependency not found." }, { status: 404 });

/** Logs the real cause server-side and returns a safe message to the client. */
export const serverError = (action: string, error: unknown) => apiServerError("tasks", action, error);
