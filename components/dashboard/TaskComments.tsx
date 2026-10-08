"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useId, useMemo, useState } from "react";

import { COMMENT_MAX_LENGTH, validateCommentInput } from "@/lib/comment-validation";
import type { CommentSummary } from "@/lib/comments";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import { deleteIconButtonClass, editIconButtonClass } from "./detail-styles";
import MentionTextarea, { renderMentions } from "./MentionTextarea";
import RelativeTime from "./RelativeTime";
import { fetchOlderPage, useOlderPages } from "./useOlderPages";
import UserAvatar from "./UserAvatar";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const errorClass =
  "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";

/** Sends a comment to the API; resolves to the saved comment, or an error message. */
async function saveComment(
  url: string,
  method: "POST" | "PATCH",
  content: string,
  action: string,
): Promise<{ comment: CommentSummary } | { error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: unknown;
      comment?: CommentSummary;
    } | null;

    if (response.ok && payload?.comment) {
      return { comment: payload.comment };
    }

    return {
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `We couldn't ${action} your comment right now. Please try again.`,
    };
  } catch {
    return { error: "Unable to reach the server. Check your connection and try again." };
  }
}

interface CommentItemProps {
  taskId: string;
  comment: CommentSummary;
  /** Names to emphasise where the text mentions them. */
  names: string[];
  /** Keep comments loaded from older pages in step with the server. */
  onSaved: (comment: CommentSummary) => void;
  onDeleted: (id: string) => void;
}

function CommentItem({ taskId, comment, names, onSaved, onDeleted }: CommentItemProps) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/tasks/${taskId}/comments/${comment.id}`;

  function startEditing() {
    setDraft(comment.content);
    setError("");
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const result = validateCommentInput({ content: draft });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSaving(true);
    const outcome = await saveComment(endpoint, "PATCH", result.data.content, "update");
    setSaving(false);

    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }

    onSaved(outcome.comment);
    setEditing(false);
    // Re-renders the comments and the activity list from the database.
    router.refresh();
  }

  return (
    <li className="flex gap-3">
      <UserAvatar name={comment.author.name} email={comment.author.email} avatar={comment.author.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm">
            <span className="break-words font-medium text-ink dark:text-slate-50">{comment.author.name}</span>{" "}
            <span className="whitespace-nowrap text-xs text-muted dark:text-dark-muted">
              <RelativeTime value={comment.createdAt} />
              {comment.edited && " · edited"}
            </span>
          </p>
          {!editing && (comment.canEdit || comment.canDelete) && (
            <div className="-mt-1 flex shrink-0 gap-2">
              {comment.canEdit && (
                <button type="button" onClick={startEditing} className={editIconButtonClass}>
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">Edit your comment</span>
                </button>
              )}
              {comment.canDelete && (
                <ConfirmDeleteButton
                  className={deleteIconButtonClass}
                  title="Delete comment"
                  noun="comment"
                  endpoint={endpoint}
                  onDeleted={() => onDeleted(comment.id)}
                  description={
                    <>
                      <p>
                        Delete this comment by{" "}
                        <strong className="font-semibold text-ink dark:text-slate-50">{comment.author.name}</strong>?
                      </p>
                      <p className="line-clamp-3 whitespace-pre-wrap rounded-lg bg-ink/5 px-3 py-2 dark:bg-white/5">
                        {comment.content}
                      </p>
                      <p>This can&apos;t be undone.</p>
                    </>
                  }
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">Delete comment by {comment.author.name}</span>
                </ConfirmDeleteButton>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} noValidate className="mt-2 space-y-3">
            <label htmlFor={`${id}-edit`} className="sr-only">
              Edit your comment
            </label>
            <textarea
              id={`${id}-edit`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              maxLength={COMMENT_MAX_LENGTH}
              autoFocus
              aria-describedby={error ? `${id}-error` : undefined}
              className={`${fieldClass} resize-y`}
            />
            {error && (
              <p id={`${id}-error`} role="alert" className={errorClass}>
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink [overflow-wrap:anywhere] dark:text-slate-100">
            {renderMentions(comment.content, names)}
          </p>
        )}
      </div>
    </li>
  );
}

interface TaskCommentsProps {
  taskId: string;
  /** The latest page, oldest first. */
  comments: CommentSummary[];
  /** Cursor for the page before it; null when there are no older comments. */
  nextCursor: string | null;
  /** The other people who can open this task, offered after "@". Empty for a personal task. */
  mentionable: string[];
  /** The signed-in user's name, so mentions of them are emphasised too. */
  viewerName: string;
}

/**
 * Comment list and form for the task detail page. Older comments are loaded a
 * page at a time on request. The server decides who may edit or delete what.
 */
export default function TaskComments({ taskId, comments, nextCursor, mentionable, viewerName }: TaskCommentsProps) {
  const router = useRouter();
  const listUrl = `/api/tasks/${taskId}/comments`;
  const loadPage = useCallback(
    (cursor: string) => fetchOlderPage<CommentSummary>(listUrl, cursor, "comments"),
    [listUrl],
  );
  const paged = useOlderPages(comments, nextCursor, loadPage);
  const id = useId();
  const names = useMemo(
    () => (mentionable.length > 0 ? [...mentionable, viewerName] : []),
    [mentionable, viewerName],
  );
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const result = validateCommentInput({ content });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);
    const outcome = await saveComment(listUrl, "POST", result.data.content, "add");
    setSubmitting(false);

    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }

    setContent("");
    // Re-renders the comments and the activity list from the database.
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {paged.items.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-muted">No comments yet. Be the first to add one.</p>
      ) : (
        <>
          {paged.hasMore && (
            <div>
              <button
                type="button"
                onClick={paged.loadMore}
                disabled={paged.loading}
                className={`${secondaryButtonClass} w-full sm:w-auto`}
              >
                {paged.loading ? "Loading..." : "Load earlier comments"}
              </button>
            </div>
          )}
          {paged.error && (
            <p role="alert" className={errorClass}>
              {paged.error}
            </p>
          )}
          <ul className="space-y-5">
            {paged.items.map((comment) => (
              <CommentItem
                key={comment.id}
                taskId={taskId}
                comment={comment}
                names={names}
                onSaved={paged.replace}
                onDeleted={paged.remove}
              />
            ))}
          </ul>
        </>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="space-y-3 border-t border-ink/10 pt-5 dark:border-white/10"
      >
        <label htmlFor={`${id}-new`} className="block text-sm font-medium text-ink dark:text-slate-100">
          Add a comment
        </label>
        <MentionTextarea
          id={`${id}-new`}
          value={content}
          onChange={setContent}
          names={mentionable}
          rows={3}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder={mentionable.length > 0 ? "Write a comment... Type @ to mention a teammate." : "Write a comment..."}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${fieldClass} resize-y placeholder:text-muted dark:placeholder:text-dark-muted`}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className={errorClass}>
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full sm:w-auto`}>
            {submitting ? "Adding..." : "Add comment"}
          </button>
        </div>
      </form>
    </div>
  );
}
