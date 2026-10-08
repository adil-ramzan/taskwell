"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-dark-surface";

interface ConfirmDeleteButtonProps {
  className: string;
  children: ReactNode;
  /** Dialog heading, e.g. "Delete task". */
  title: string;
  /** Identifies what is being deleted and what else is removed with it. */
  description: ReactNode;
  /** API route that receives the DELETE request; it enforces ownership. */
  endpoint: string;
  /** Where to go once the item no longer exists; omit on a list, which just refreshes. */
  redirectTo?: string;
  /** Lowercase noun for the fallback error message, e.g. "task". */
  noun: string;
  /** Verb for the fallback error message and busy label; defaults to "delete". */
  verb?: "delete" | "remove" | "cancel" | "leave" | "sign out";
  /** When set, the confirm button stays disabled until this exact text is typed. */
  confirmText?: string;
  /** Called after the server confirmed the deletion, before the page data is refreshed. */
  onDeleted?: () => void;
}

const busyLabels = {
  delete: "Deleting...",
  remove: "Removing...",
  cancel: "Cancelling...",
  leave: "Leaving...",
  "sign out": "Signing out...",
};

/**
 * Trigger plus a confirmation dialog for a DELETE request, built like the create
 * dialogs (native modal <dialog>). Shared by task, project and team deletion,
 * member removal and invitation cancelling.
 */
export default function ConfirmDeleteButton({
  className,
  children,
  title,
  description,
  endpoint,
  redirectTo,
  noun,
  verb = "delete",
  confirmText,
  onDeleted,
}: ConfirmDeleteButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const id = useId();
  const confirmed = confirmText === undefined || typed.trim() === confirmText;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function openDialog() {
    setError("");
    setTyped("");
    dialogRef.current?.showModal();
    // Start on the safe choice so Enter doesn't delete by accident.
    cancelRef.current?.focus();
    setOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleDelete() {
    if (deleting || !confirmed) {
      return;
    }

    setError("");
    setDeleting(true);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : `We couldn't ${verb} this ${noun} right now. Please try again.`,
        );
        setDeleting(false);
        return;
      }

      // A detail page no longer exists, so replace it. refresh() re-renders the
      // server data and drops cached dashboard pages; the dialog stays busy until
      // the page is replaced or the deleted item's row unmounts it.
      onDeleted?.();

      if (redirectTo) {
        router.replace(redirectTo);
      }

      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
      setDeleting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" className={className}>
        {children}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !deleting) {
            closeDialog();
          }
        }}
        onCancel={(event) => {
          if (deleting) {
            event.preventDefault();
          }
        }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <div className="p-6">
          <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
            {title}
          </h2>
          <div id={`${id}-description`} className="mt-2 space-y-2 break-words text-sm text-muted dark:text-dark-muted">
            {description}
          </div>

          {confirmText !== undefined && (
            <div className="mt-4">
              <label htmlFor={`${id}-confirm`} className="mb-2 block text-sm font-medium text-ink dark:text-slate-100">
                Type <span className="break-all font-semibold">{confirmText}</span> to confirm
              </label>
              <input
                id={`${id}-confirm`}
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50"
              />
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              onClick={closeDialog}
              disabled={deleting}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || !confirmed}
              className={dangerButtonClass}
            >
              {deleting ? busyLabels[verb] : title}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
