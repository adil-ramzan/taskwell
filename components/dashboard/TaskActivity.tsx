"use client";

import { useCallback } from "react";

import type { ActivitySummary } from "@/lib/activity";
import { DELETED_USER } from "@/lib/avatars";
import { describeRecurrenceRule } from "@/lib/recurrence-rules";
import {
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import { formatTracked } from "@/lib/time-rules";
import { DueDateText } from "./DueDate";
import LabelChip from "./LabelChip";
import RelativeTime from "./RelativeTime";
import { fetchOlderPage, useOlderPages } from "./useOlderPages";
import UserAvatar from "./UserAvatar";

const strongClass = "font-medium text-ink dark:text-slate-50";

const Value = ({ children }: { children: string }) => <span className={strongClass}>{children}</span>;

/** The sentence after the actor's name, e.g. "changed status from To do to In progress". */
function describeActivity(activity: ActivitySummary) {
  // undefined = the account or project can no longer be looked up.
  const person = (name: string | null | undefined) => <Value>{name ?? "a former member"}</Value>;

  switch (activity.type) {
    case "TASK_CREATED":
      return "created this task";
    case "TASK_UPDATED":
      return `updated the ${activity.fields?.join(" and ") || "task"}`;
    case "TASK_STATUS_CHANGED":
      return (
        <>
          changed status from <Value>{taskStatusLabels[activity.from as TaskStatusValue] ?? "unknown"}</Value> to{" "}
          <Value>{taskStatusLabels[activity.to as TaskStatusValue] ?? "unknown"}</Value>
        </>
      );
    case "TASK_PRIORITY_CHANGED":
      return (
        <>
          changed priority from <Value>{taskPriorityLabels[activity.from as TaskPriorityValue] ?? "unknown"}</Value>{" "}
          to <Value>{taskPriorityLabels[activity.to as TaskPriorityValue] ?? "unknown"}</Value>
        </>
      );
    case "TASK_PROJECT_CHANGED":
      return activity.project ? (
        <>
          moved this task to <Value>{activity.project}</Value>
        </>
      ) : (
        "moved this task to another project"
      );
    case "TASK_ASSIGNEE_CHANGED":
      if (activity.toUser === null) {
        return <>unassigned {person(activity.fromUser)} from this task</>;
      }

      return activity.fromUser === null ? (
        <>assigned this task to {person(activity.toUser)}</>
      ) : (
        <>
          reassigned this task from {person(activity.fromUser)} to {person(activity.toUser)}
        </>
      );
    case "TASK_DUE_DATE_CHANGED": {
      // Shown in the reader's time zone, like every other due date.
      const due = (value: string) => (
        <span className={strongClass}>
          <DueDateText value={value} />
        </span>
      );

      if (!activity.toDue) return "removed the due date";

      return activity.fromDue ? (
        <>
          changed the due date from {due(activity.fromDue)} to {due(activity.toDue)}
        </>
      ) : (
        <>set the due date to {due(activity.toDue)}</>
      );
    }
    case "SUBTASK_ADDED":
      return activity.task ? (
        <>
          added the subtask <Value>{activity.task.title}</Value>
        </>
      ) : (
        "added a subtask"
      );
    case "SUBTASK_REMOVED":
      if (activity.deleted) return "deleted a subtask";

      return activity.task ? (
        <>
          detached the subtask <Value>{activity.task.title}</Value>
        </>
      ) : (
        "detached a subtask"
      );
    case "DEPENDENCY_ADDED":
      // A task that is gone, or that the reader can't open, is never named.
      if (!activity.task) {
        return activity.relation === "blocks"
          ? "marked this task as blocking another task"
          : "marked this task as blocked by another task";
      }

      return activity.relation === "blocks" ? (
        <>
          marked this task as blocking <Value>{activity.task.title}</Value>
        </>
      ) : (
        <>
          marked this task as blocked by <Value>{activity.task.title}</Value>
        </>
      );
    case "DEPENDENCY_REMOVED":
      if (activity.deleted) {
        return activity.relation === "blocks"
          ? "deleted a task that this one was blocking"
          : "deleted a task that was blocking this one";
      }

      if (!activity.task) return "removed a dependency";

      return activity.relation === "blocks" ? (
        <>
          no longer marks this task as blocking <Value>{activity.task.title}</Value>
        </>
      ) : (
        <>
          no longer marks this task as blocked by <Value>{activity.task.title}</Value>
        </>
      );
    case "RECURRENCE_CREATED":
      return activity.rule ? (
        <>
          set this task to repeat <Value>{describeRecurrenceRule(activity.rule)}</Value>
        </>
      ) : (
        "set this task to repeat"
      );
    case "RECURRENCE_UPDATED":
      return activity.rule ? (
        <>
          changed the repeat schedule to <Value>{describeRecurrenceRule(activity.rule)}</Value>
        </>
      ) : (
        "changed the repeat schedule"
      );
    case "RECURRENCE_DISABLED":
      return "turned off repeating for this task";
    case "RECURRENCE_GENERATED":
      // Both tasks have the same title, so neither is named.
      return activity.generated === "this"
        ? "completed the previous occurrence, which created this task as the next one"
        : "completed this occurrence, which created the next one";
    case "TASK_LABELS_ADDED":
    case "TASK_LABELS_REMOVED": {
      const shown = activity.labels ?? [];
      const missing = activity.missingLabels ?? 0;
      const verb = activity.type === "TASK_LABELS_ADDED" ? "added" : "removed";
      const total = shown.length + missing;

      // A label that has since been deleted has no name left to show.
      if (shown.length === 0) return `${verb} ${total === 1 ? "a label that has since been deleted" : `${total} labels that have since been deleted`}`;

      return (
        <>
          {verb} the {total === 1 ? "label" : "labels"}{" "}
          {shown.map((label, index) => (
            <span key={label.id}>
              {index > 0 && " "}
              <LabelChip label={label} />
            </span>
          ))}
          {missing > 0 && ` and ${missing === 1 ? "one that has" : `${missing} that have`} since been deleted`}
        </>
      );
    }
    case "TIME_ENTRY_ADDED":
      return (
        <>
          {activity.manual ? "logged" : "tracked"} <Value>{formatTracked(activity.seconds ?? 0)}</Value>
        </>
      );
    case "TIME_ENTRY_UPDATED":
      return (
        <>
          changed a time entry to <Value>{formatTracked(activity.seconds ?? 0)}</Value>
        </>
      );
    case "TIME_ENTRY_DELETED":
      return (
        <>
          deleted a time entry of <Value>{formatTracked(activity.seconds ?? 0)}</Value>
          {activity.entryUser && (
            <>
              {" "}
              by <Value>{activity.entryUser}</Value>
            </>
          )}
        </>
      );
    case "ATTACHMENT_ADDED":
      return activity.fileName ? (
        <>
          attached <Value>{activity.fileName}</Value>
        </>
      ) : (
        "attached a file that has since been removed"
      );
    case "ATTACHMENT_DELETED":
      return activity.fileUploader ? (
        <>
          removed an attachment uploaded by <Value>{activity.fileUploader}</Value>
        </>
      ) : (
        "removed an attachment"
      );
    case "COMMENT_ADDED":
      return "added a comment";
    case "COMMENT_UPDATED":
      return "updated a comment";
    case "COMMENT_DELETED":
      return activity.commentAuthor ? (
        <>
          deleted a comment by <Value>{activity.commentAuthor}</Value>
        </>
      ) : (
        "deleted a comment"
      );
  }
}

interface TaskActivityProps {
  taskId: string;
  /** The latest page, newest first. */
  activities: ActivitySummary[];
  /** Cursor for the page before it; null when there is nothing older. */
  nextCursor: string | null;
}

/**
 * A task's history, newest first, as sentences (not colour-coded). Older events
 * are loaded a page at a time on request.
 */
export default function TaskActivity({ taskId, activities, nextCursor }: TaskActivityProps) {
  const loadPage = useCallback(
    (cursor: string) => fetchOlderPage<ActivitySummary>(`/api/tasks/${taskId}/activity`, cursor, "activities"),
    [taskId],
  );
  const paged = useOlderPages(activities, nextCursor, loadPage);

  if (paged.items.length === 0) {
    // Every task created since activity history exists has at least "created this
    // task", so an empty history means an older task. Nothing is made up for it.
    return (
      <p className="text-sm text-muted dark:text-dark-muted">
        This task was created before activity history was enabled, so earlier changes aren&apos;t listed. New
        changes to the task and its comments will appear here.
      </p>
    );
  }

  return (
    <>
      <ol className="space-y-4">
        {[...paged.items].reverse().map((activity) => (
          <li key={activity.id} className="flex gap-3">
            {/* The record outlives the account that made it; nobody is named in its place. */}
            <UserAvatar
              name={activity.actor?.name ?? ""}
              email={activity.actor?.email ?? ""}
              avatar={activity.actor?.avatar}
              size="xs"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="break-words text-muted dark:text-dark-muted">
                <span className={activity.actor ? strongClass : "font-medium italic"}>
                  {activity.actor?.name ?? DELETED_USER}
                </span>{" "}
                {describeActivity(activity)}
              </p>
              <p className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                <RelativeTime value={activity.createdAt} />
              </p>
            </div>
          </li>
        ))}
      </ol>
      {paged.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {paged.error}
        </p>
      )}
      {paged.hasMore && (
        <button
          type="button"
          onClick={paged.loadMore}
          disabled={paged.loading}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100 sm:w-auto"
        >
          {paged.loading ? "Loading..." : "Load older activity"}
        </button>
      )}
    </>
  );
}
