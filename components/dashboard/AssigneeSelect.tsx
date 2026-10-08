"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TaskSummary } from "@/lib/tasks";
import { useAssignableMembers } from "./AssignmentContext";
import TaskAssignee from "./TaskAssignee";

const UNASSIGNED = "";

/**
 * A task's assignee on its detail page. Team owners and admins get a picker
 * limited to the members of the project's team; everyone else sees it read-only.
 */
export default function AssigneeSelect({ task }: { task: Pick<TaskSummary, "id" | "title" | "assignee" | "project"> }) {
  const router = useRouter();
  const members = useAssignableMembers(task.project.teamId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!members) {
    return <TaskAssignee assignee={task.assignee} />;
  }

  async function assign(assigneeId: string) {
    if (saving) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't update the assignee right now. Please try again.",
        );
      }

      // Success shows the saved assignee; failure reloads the real state (the select is bound to it).
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="relative w-full max-w-[16rem]">
        <select
          aria-label={`Assignee for ${task.title}`}
          value={task.assignee?.id ?? UNASSIGNED}
          disabled={saving}
          onChange={(event) => assign(event.target.value)}
          className="min-h-10 w-full appearance-none rounded-lg border border-ink/15 bg-paper pl-3 pr-9 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-progress disabled:opacity-70 dark:border-white/15 dark:bg-dark-background dark:text-slate-100"
        >
          <option value={UNASSIGNED}>{saving && !task.assignee ? "Saving..." : "Unassigned"}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {saving && member.id === task.assignee?.id ? "Saving..." : member.name}
            </option>
          ))}
          {/* Keeps the current value visible if the list is momentarily out of date. */}
          {task.assignee && !members.some((member) => member.id === task.assignee?.id) && (
            <option value={task.assignee.id}>{task.assignee.name}</option>
          )}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
