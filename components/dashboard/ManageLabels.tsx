"use client";

import { ChevronDown, Pencil, Tags, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";

import { DEFAULT_LABEL_COLOR, LABEL_NAME_MAX_LENGTH, validateLabelInput, validateLabelUpdate, type LabelColor } from "@/lib/label-rules";
import type { LabelSummary, LabelWorkspace } from "@/lib/labels";
import LabelChip from "./LabelChip";
import LabelColorPicker from "./LabelColorPicker";

const fieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-ink/20 bg-paper px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-dark-background dark:text-slate-50";
const smallLabelClass = "mb-1 block text-xs font-medium text-muted dark:text-dark-muted";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-dark-surface dark:text-slate-100";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-80 dark:focus-visible:ring-offset-dark-surface";
const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/30 dark:bg-dark-surface dark:text-red-300 dark:hover:bg-red-500/10";
const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50";
const errorClass =
  "break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300";

async function failure(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

  return typeof payload?.error === "string" ? payload.error : fallback;
}

const OFFLINE = "Unable to reach the server. Check your connection and try again.";

interface ManageLabelsProps {
  className: string;
  /** Where a label can be created: the user's personal labels and each of their teams. */
  workspaces: LabelWorkspace[];
  /** Called after any change, for a caller that keeps its own copy of the labels. */
  onChanged?: () => void;
}

/**
 * Every label the user can use, grouped by workspace, with a form to add one
 * and, where they are allowed to (their own labels; a team's as its owner or
 * admin), rename, recolor and delete. The server decides all of that again.
 */
export default function ManageLabels({ className, workspaces, onChanged }: ManageLabelsProps) {
  const router = useRouter();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<LabelSummary[] | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);
  // The create form.
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [teamId, setTeamId] = useState("");
  // The row being edited, or asked about before deleting.
  const [editing, setEditing] = useState<{ id: string; name: string; color: LabelColor } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const editNameRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const editingId = editing?.id;

  // Opening a row for editing or deleting moves focus into it: to the name, or to the safe choice.
  useEffect(() => {
    if (editingId) editNameRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (deleting) keepRef.current?.focus();
  }, [deleting]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/labels", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { labels?: LabelSummary[] } | null;

      if (!response.ok || !Array.isArray(payload?.labels)) {
        setError("We couldn't load your labels right now. Please try again.");
        return;
      }

      setLabels(payload.labels);
    } catch {
      setError(OFFLINE);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function openDialog() {
    setError("");
    setEditing(null);
    setDeleting(null);
    setName("");
    setLabels(null);
    dialogRef.current?.showModal();
    setOpen(true);
    nameRef.current?.focus();
    void load();
  }

  const closeDialog = () => dialogRef.current?.close();

  /** After a change: the list here, the page behind it, and whoever asked to be told. */
  async function changed(message: string) {
    setAnnouncement(message);
    await load();
    onChanged?.();
    router.refresh();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const result = validateLabelInput({ name, color, ...(teamId ? { teamId } : {}) });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        setError(await failure(response, "We couldn't create this label right now. Please try again."));
        return;
      }

      setName("");
      // Ready for the next one; before the reload, so a click made meanwhile keeps its focus.
      nameRef.current?.focus();
      await changed(`Label “${result.data.name}” created.`);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy || !editing) return;

    const result = validateLabelUpdate({ name: editing.name, color: editing.color });

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await fetch(`/api/labels/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        setError(await failure(response, "We couldn't save this label right now. Please try again."));
        return;
      }

      setEditing(null);
      await changed(`Label “${result.data.name}” saved.`);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  async function remove(label: LabelSummary) {
    if (busy) return;

    setError("");
    setBusy(true);

    try {
      const response = await fetch(`/api/labels/${label.id}`, { method: "DELETE" });

      // Already gone (deleted by a teammate) is what was wanted.
      if (!response.ok && response.status !== 404) {
        setError(await failure(response, "We couldn't delete this label right now. Please try again."));
        return;
      }

      setDeleting(null);
      await changed(`Label “${label.name}” deleted.`);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  const groups = workspaces.map((workspace) => ({
    workspace,
    labels: (labels ?? []).filter((label) => (label.team?.id ?? null) === workspace.teamId),
  }));

  return (
    <>
      <button type="button" onClick={openDialog} aria-haspopup="dialog" className={className}>
        <Tags aria-hidden="true" className="h-4 w-4" />
        Manage labels
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget && !busy) closeDialog();
        }}
        className="w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="font-display text-xl font-semibold text-ink dark:text-slate-50">
                Manage labels
              </h2>
              <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                Personal labels are for tasks in your own projects. A team&apos;s labels are shared by its projects.
              </p>
            </div>
            <button type="button" onClick={closeDialog} aria-label="Close" className={iconButtonClass}>
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <p role="status" className="sr-only">
            {announcement}
          </p>

          <form onSubmit={create} noValidate aria-label="Add a label" className="mt-5 space-y-3 rounded-xl border border-ink/10 p-4 dark:border-white/10">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor={`${id}-name`} className={smallLabelClass}>
                  New label
                </label>
                <input
                  ref={nameRef}
                  id={`${id}-name`}
                  type="text"
                  value={name}
                  maxLength={LABEL_NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  placeholder="Label name"
                  className={fieldClass}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${id}-workspace`} className={smallLabelClass}>
                  For
                </label>
                <div className="relative">
                  <select
                    id={`${id}-workspace`}
                    value={teamId}
                    onChange={(event) => setTeamId(event.target.value)}
                    disabled={busy}
                    className={`${fieldClass} appearance-none truncate pr-9`}
                  >
                    {workspaces.map((workspace) => (
                      <option key={workspace.teamId ?? "personal"} value={workspace.teamId ?? ""}>
                        {workspace.teamId ? workspace.name : "Personal (my own projects)"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LabelColorPicker name={`${id}-new-color`} value={color} onChange={setColor} disabled={busy} />
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                Add label
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className={`mt-4 ${errorClass}`}>
              {error}
            </p>
          )}

          {labels === null ? (
            !error && <p className="mt-5 text-sm text-muted dark:text-dark-muted">Loading labels...</p>
          ) : (
            groups.map(({ workspace, labels: group }) => (
              <section key={workspace.teamId ?? "personal"} aria-labelledby={`${id}-ws-${workspace.teamId ?? "personal"}`} className="mt-6">
                <h3
                  id={`${id}-ws-${workspace.teamId ?? "personal"}`}
                  className="break-words text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-muted"
                >
                  {workspace.name}
                </h3>
                {group.length === 0 ? (
                  <p className="mt-2 text-sm text-muted dark:text-dark-muted">No labels yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink/10 rounded-lg border border-ink/10 dark:divide-white/10 dark:border-white/10">
                    {group.map((label) => (
                      <li key={label.id} className="px-3 py-2">
                        {editing?.id === label.id ? (
                          <form onSubmit={save} noValidate aria-label={`Edit label ${label.name}`} className="space-y-2">
                            <label htmlFor={`${id}-edit-${label.id}`} className={smallLabelClass}>
                              Label name
                            </label>
                            <input
                              id={`${id}-edit-${label.id}`}
                              type="text"
                              value={editing.name}
                              ref={editNameRef}
                              maxLength={LABEL_NAME_MAX_LENGTH}
                              disabled={busy}
                              autoComplete="off"
                              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                              className={fieldClass}
                            />
                            <LabelColorPicker
                              name={`${id}-edit-color-${label.id}`}
                              value={editing.color}
                              onChange={(next) => setEditing({ ...editing, color: next })}
                              disabled={busy}
                            />
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button type="button" onClick={() => setEditing(null)} disabled={busy} className={secondaryButtonClass}>
                                Cancel
                              </button>
                              <button type="submit" disabled={busy} className={primaryButtonClass}>
                                Save label
                              </button>
                            </div>
                          </form>
                        ) : deleting === label.id ? (
                          <div role="group" aria-label={`Delete label ${label.name}`} className="space-y-2">
                            <p className="break-words text-sm text-ink dark:text-slate-100">
                              Delete <LabelChip label={label} />?{" "}
                              {label.taskCount === 0
                                ? "No task has it."
                                : `It will be taken off ${label.taskCount} ${label.taskCount === 1 ? "task" : "tasks"}; the tasks stay.`}{" "}
                              This can&apos;t be undone.
                            </p>
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                              <button type="button" onClick={() => setDeleting(null)} disabled={busy} ref={keepRef} className={secondaryButtonClass}>
                                Keep label
                              </button>
                              <button type="button" onClick={() => void remove(label)} disabled={busy} className={dangerButtonClass}>
                                Delete label
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <LabelChip label={label} />
                              <p className="mt-0.5 text-xs text-muted dark:text-dark-muted">
                                {label.taskCount === 1 ? "1 task" : `${label.taskCount} tasks`}
                                {!label.canManage && " · Only the team's owner and admins can change it"}
                              </p>
                            </div>
                            {label.canManage && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setError("");
                                    setDeleting(null);
                                    setEditing({ id: label.id, name: label.name, color: label.color });
                                  }}
                                  aria-label={`Edit label ${label.name}`}
                                  className={iconButtonClass}
                                >
                                  <Pencil aria-hidden="true" className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setError("");
                                    setEditing(null);
                                    setDeleting(label.id);
                                  }}
                                  aria-label={`Delete label ${label.name}`}
                                  className={`${iconButtonClass} hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300`}
                                >
                                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={closeDialog} className={secondaryButtonClass}>
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
