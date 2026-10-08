"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { TEAM_DESCRIPTION_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, validateTeamInput } from "@/lib/team-validation";

const fieldClass =
  "w-full rounded-lg border border-ink/20 bg-paper px-4 py-3 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";

interface CreateTeamButtonProps {
  className: string;
  children: ReactNode;
}

/** Create Team trigger plus dialog, built like CreateProjectButton (native modal <dialog>). */
export default function CreateTeamButton({ className, children }: CreateTeamButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

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
    formRef.current?.reset();
    dialogRef.current?.showModal();
    nameRef.current?.focus();
    setOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const result = validateTeamInput({
      name: formData.get("name"),
      description: formData.get("description"),
    });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
        team?: { id?: unknown };
      } | null;

      if (!response.ok || typeof payload?.team?.id !== "string") {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't create your team right now. Please try again.",
        );
        return;
      }

      closeDialog();
      // Open the new team; refresh() also updates the sidebar's team choices.
      router.push(`/dashboard/teams/${payload.team.id}`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
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
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !submitting) {
            closeDialog();
          }
        }}
        onCancel={(event) => {
          if (submitting) {
            event.preventDefault();
          }
        }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                Create team
              </h2>
              <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                You&apos;ll be the team&apos;s owner and can invite people afterwards.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              aria-label="Close"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <p
              id={`${id}-error`}
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium text-ink dark:text-slate-100">
                Team name
              </label>
              <input
                ref={nameRef}
                id={`${id}-name`}
                name="name"
                type="text"
                required
                maxLength={TEAM_NAME_MAX_LENGTH}
                aria-describedby={error ? `${id}-error` : undefined}
                className={fieldClass}
              />
            </div>

            <div>
              <label
                htmlFor={`${id}-description`}
                className="mb-2 block text-sm font-medium text-ink dark:text-slate-100"
              >
                Description <span className="font-normal text-muted dark:text-dark-muted">(optional)</span>
              </label>
              <textarea
                id={`${id}-description`}
                name="description"
                rows={3}
                maxLength={TEAM_DESCRIPTION_MAX_LENGTH}
                className={`${fieldClass} resize-y`}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface"
            >
              {submitting ? "Creating..." : "Create team"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
