"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { LabelWorkspace } from "@/lib/labels";
import type { TemplateSummary } from "@/lib/task-templates";
import { describeDueOffset } from "@/lib/template-rules";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import type { ProjectOption } from "./CreateTaskButton";
import { cardClass, deleteIconButtonClass, editIconButtonClass, termClass, valueClass } from "./detail-styles";
import { LabelList } from "./LabelChip";
import { TaskPriorityBadge, TaskStatusBadge } from "./TaskBadges";
import TemplateFormButton from "./TemplateFormButton";
import UseTemplateButton from "./UseTemplateButton";

const useButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface";

interface TemplatesViewProps {
  templates: TemplateSummary[];
  workspaces: LabelWorkspace[];
  /** The signed-in user's projects, or null when they couldn't be loaded. */
  projects: ProjectOption[] | null;
}

/** The template cards with their actions. The data is loaded, and every action checked again, on the server. */
export default function TemplatesView({ templates, workspaces, projects }: TemplatesViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  async function duplicate(template: TemplateSummary) {
    if (busy) return;

    setError("");
    setBusy(template.id);

    try {
      const response = await fetch(`/api/task-templates/${template.id}/duplicate`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { template?: TemplateSummary; error?: unknown } | null;

      if (!response.ok || !payload?.template) {
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't duplicate this template right now. Please try again.",
        );
        return;
      }

      setAnnouncement(`Template duplicated as “${payload.template.name}”.`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <ul id="template-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <li key={template.id} className={`${cardClass} flex min-w-0 flex-col`}>
            <p className="break-words text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-muted">
              {template.team ? template.team.name : "Personal"}
            </p>
            <h2 className="mt-1 break-words font-display text-lg font-semibold text-ink [overflow-wrap:anywhere] dark:text-slate-50">
              {template.name}
            </h2>
            <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-muted [overflow-wrap:anywhere] dark:text-dark-muted">
              {template.description ?? "No description"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <TaskStatusBadge status={template.status} />
              <TaskPriorityBadge priority={template.priority} />
            </div>
            <LabelList labels={template.labels} className="mt-3" />

            <dl className="mb-5 mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <dt className={termClass}>Due date</dt>
                <dd className={valueClass}>{describeDueOffset(template.dueOffsetDays)}</dd>
              </div>
              <div className="min-w-0">
                <dt className={termClass}>Subtasks</dt>
                <dd className={valueClass}>{template.subtasks.length === 0 ? "None" : template.subtasks.length}</dd>
              </div>
              {template.team && (
                <div className="min-w-0">
                  <dt className={termClass}>Assignee</dt>
                  <dd className={`${valueClass} break-words`}>{template.assignee?.name ?? "Unassigned"}</dd>
                </div>
              )}
            </dl>

            <div className="mt-auto flex flex-wrap items-center gap-2">
              <UseTemplateButton template={template} projects={projects} className={useButtonClass} aria-label={`Use template ${template.name}`}>
                Use template
              </UseTemplateButton>
              <div className="ml-auto flex items-center gap-2">
                {template.canManage && (
                  <TemplateFormButton
                    template={template}
                    workspaces={workspaces}
                    className={editIconButtonClass}
                    aria-label={`Edit template ${template.name}`}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </TemplateFormButton>
                )}
                <button
                  type="button"
                  onClick={() => void duplicate(template)}
                  disabled={busy !== null}
                  aria-label={`Duplicate template ${template.name}`}
                  className={`${editIconButtonClass} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                </button>
                {template.canManage && (
                  <ConfirmDeleteButton
                    className={deleteIconButtonClass}
                    title="Delete template"
                    description={
                      <>
                        <p>
                          Delete the template <span className="font-semibold text-ink dark:text-slate-100">{template.name}</span>?
                        </p>
                        <p>Tasks already created from it are kept exactly as they are. This can&apos;t be undone.</p>
                      </>
                    }
                    endpoint={`/api/task-templates/${template.id}`}
                    noun="template"
                    onDeleted={() => setAnnouncement(`Template “${template.name}” deleted.`)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span className="sr-only">Delete template {template.name}</span>
                  </ConfirmDeleteButton>
                )}
              </div>
            </div>
            {!template.canManage && (
              <p className="mt-3 text-xs text-muted dark:text-dark-muted">Only the team&apos;s owner and admins can change it.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
