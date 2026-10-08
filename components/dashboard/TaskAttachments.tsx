"use client";

import { Download, FileText, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  extensionOf,
  formatFileSize,
  MAX_ATTACHMENTS_PER_TASK,
} from "@/lib/attachment-rules";
import type { AttachmentSummary } from "@/lib/attachments";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import { deleteIconButtonClass, editIconButtonClass } from "./detail-styles";
import FormattedDate from "./FormattedDate";

const mutedClass = "text-sm text-muted dark:text-dark-muted";
const linkClass =
  "break-words font-medium text-brand-dark underline-offset-2 [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50";

/**
 * A task's attached files: the list (name, size, who attached it and when),
 * a way to add one, and a way to delete where allowed. The checks here only
 * save a round trip; the server checks the size, the type against the file's
 * real contents, and who may do what.
 */
export default function TaskAttachments({ taskId, attachments }: { taskId: string; attachments: AttachmentSummary[] }) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const full = attachments.length >= MAX_ATTACHMENTS_PER_TASK;
  const fileUrl = (attachment: AttachmentSummary) => `/api/tasks/${taskId}/attachments/${attachment.id}`;

  async function upload(file: File) {
    setError("");

    if (!ATTACHMENT_TYPES[extensionOf(file.name)]) {
      setError("This kind of file can't be attached. Allowed: images (PNG, JPG, GIF, WebP), PDF, text (TXT, MD, CSV, JSON), Word, Excel, PowerPoint and ZIP.");
      return;
    }

    if (file.size === 0) {
      setError("This file is empty.");
      return;
    }

    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError(`Choose a file of ${formatFileSize(ATTACHMENT_MAX_BYTES)} or less. This one is ${formatFileSize(file.size)}.`);
      return;
    }

    setUploading(file.name);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(typeof payload?.error === "string" ? payload.error : "We couldn't attach this file right now. Please try again.");
        return;
      }

      setAnnouncement(`${file.name} attached.`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setUploading("");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="task-attachments-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Attachments <span className="text-sm font-normal text-muted dark:text-dark-muted">({attachments.length})</span>
          </h2>
          <p id={`${id}-hint`} className={`mt-1 ${mutedClass}`}>
            Images, PDF, text, Office files and ZIP, up to {formatFileSize(ATTACHMENT_MAX_BYTES)} each.
          </p>
        </div>
        {/* A real file input, hidden from view but not from the keyboard or screen readers; the label is its button. */}
        <div>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            disabled={uploading !== "" || full}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so choosing the same file again (after an error, say) fires a change.
              event.target.value = "";

              if (file) void upload(file);
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={`${id}-file`}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:peer-focus-visible:ring-offset-dark-surface"
          >
            <Paperclip aria-hidden="true" className="h-4 w-4" />
            {uploading ? "Uploading..." : "Attach file"}
          </label>
        </div>
      </div>

      <p role="status" className="sr-only">
        {uploading ? `Uploading ${uploading}` : announcement}
      </p>

      {uploading && (
        <p className={`mt-4 break-words [overflow-wrap:anywhere] ${mutedClass}`}>
          Uploading <span className="font-medium text-ink dark:text-slate-100">{uploading}</span>…
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {full && <p className={`mt-4 ${mutedClass}`}>This task has the most files it can have ({MAX_ATTACHMENTS_PER_TASK}). Delete one to attach another.</p>}

      {attachments.length === 0 ? (
        <p className={`mt-4 ${mutedClass}`}>No files are attached to this task yet.</p>
      ) : (
        <ul aria-label="Attached files" className="mt-4 divide-y divide-ink/10 dark:divide-white/10">
          {attachments.map((attachment) => {
            const Icon = attachment.inline ? ImageIcon : FileText;

            return (
              <li key={attachment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-muted dark:bg-white/5 dark:text-dark-muted">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  {attachment.inline ? (
                    // Images open in a new tab; the server sends them so that nothing in them can run.
                    <a href={fileUrl(attachment)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {attachment.name}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <a href={fileUrl(attachment)} download={attachment.name} className={linkClass}>
                      {attachment.name}
                    </a>
                  )}
                  <p className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                    {formatFileSize(attachment.size)} · {attachment.uploader?.name ?? "Deleted user"}
                    {attachment.mine && " (you)"} · <FormattedDate value={attachment.createdAt} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`${fileUrl(attachment)}?download=1`}
                    download={attachment.name}
                    aria-label={`Download ${attachment.name}`}
                    className={editIconButtonClass}
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                  </a>
                  {attachment.canDelete && (
                    <ConfirmDeleteButton
                      className={deleteIconButtonClass}
                      title="Delete attachment"
                      description={
                        <p>
                          Delete <span className="break-words font-semibold text-ink [overflow-wrap:anywhere] dark:text-slate-100">{attachment.name}</span>{" "}
                          from this task? The file is removed for everyone. This can&apos;t be undone.
                        </p>
                      }
                      endpoint={fileUrl(attachment)}
                      noun="file"
                      onDeleted={() => setAnnouncement(`${attachment.name} deleted.`)}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only">Delete {attachment.name}</span>
                    </ConfirmDeleteButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
