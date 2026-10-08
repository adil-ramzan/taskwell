"use client";

import { ChevronDown, GripVertical, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { matchesLabels } from "@/lib/label-rules";
import type { LabelSummary, LabelWorkspace } from "@/lib/labels";
import type { TaskSummary } from "@/lib/tasks";
import { LabelList } from "./LabelChip";
import LabelFilter, { NO_LABEL_FILTER } from "./LabelFilter";
import ManageLabels from "./ManageLabels";
import type { TeamMembersByTeam } from "@/lib/teams";
import { assigneeOptions } from "./assignee-options";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";
import type { ProjectOption } from "./CreateTaskButton";
import FormattedDate from "./FormattedDate";
import Pagination, { paginate } from "./Pagination";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge, taskStatusColors } from "./TaskBadges";

/** Cards per page of one column. */
export const BOARD_COLUMN_PAGE_SIZE = 10;

const ALL = "";
const UNASSIGNED = "unassigned";

const controlClass =
  "min-h-11 w-full rounded-lg border border-ink/20 bg-white text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";
const chevronClass =
  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted";

interface TaskBoardProps {
  tasks: TaskSummary[];
  projects: ProjectOption[];
  /** Members of the user's teams, so the assignee filter also lists people with no tasks. */
  teamMembers: TeamMembersByTeam;
  /** The labels offered by the label filter; without them the filter isn't shown. */
  labels?: LabelSummary[];
  /** Where labels can be created; with them the Manage labels button is shown. */
  labelWorkspaces?: LabelWorkspace[];
}

/**
 * Kanban board over the task statuses. A move (drag and drop, or the "Move to"
 * select on each card, which also serves keyboard and touch users) is shown
 * immediately, saved with PATCH /api/tasks/[id], and rolled back if saving fails.
 */
export default function TaskBoard({ tasks, projects, teamMembers, labels, labelWorkspaces }: TaskBoardProps) {
  // Which labels, and whether a card needs any one of them or all of them.
  const [labelFilter, setLabelFilter] = useState(NO_LABEL_FILTER);
  const labelIds = useMemo(
    () => labelFilter.ids.filter((id) => !labels || labels.some((label) => label.id === id)),
    [labelFilter.ids, labels],
  );
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState(ALL);
  const [priority, setPriority] = useState<TaskPriorityValue | typeof ALL>(ALL);
  // "" = everyone, "unassigned", or a user ID.
  const [assignee, setAssignee] = useState(ALL);
  // The people offered are the members of the teams in scope: the selected project's
  // team, or (with all projects) the teams of every project on the board.
  const assignees = useMemo(() => {
    const scope = projectId ? projects.filter((project) => project.id === projectId) : projects;
    const inScope = projectId ? tasks.filter((task) => task.project.id === projectId) : tasks;

    return assigneeOptions(inScope, scope.map((project) => project.teamId), teamMembers);
  }, [tasks, projects, projectId, teamMembers]);
  // Statuses shown ahead of the server: taskId -> status the user moved it to.
  const [moved, setMoved] = useState<Record<string, TaskStatusValue>>({});
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const savingRef = useRef(new Set<string>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatusValue | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const deferredQuery = useDeferredValue(query);

  // Fresh server data is the truth; keep only the moves that are still being saved.
  useEffect(() => {
    setMoved((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => savingRef.current.has(id))),
    );
  }, [tasks]);

  const statusOf = (task: TaskSummary) => moved[task.id] ?? task.status;

  // Filtering is local to the already-loaded tasks; the server already scoped them to this user.
  const visibleTasks = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();

    return tasks.filter(
      (task) =>
        (!projectId || task.project.id === projectId) &&
        (!priority || task.priority === priority) &&
        (!assignee || (assignee === UNASSIGNED ? task.assignee === null : task.assignee?.id === assignee)) &&
        (!term || task.title.toLowerCase().includes(term)) &&
        matchesLabels(
          task.labels.map((label) => label.id),
          labelIds,
          labelFilter.mode,
        ),
    );
  }, [tasks, projectId, priority, assignee, deferredQuery, labelIds, labelFilter.mode]);
  const filtered = Boolean(projectId || priority || assignee || query.trim() || labelIds.length > 0);

  function setTaskSaving(taskId: string, isSaving: boolean) {
    if (isSaving) {
      savingRef.current.add(taskId);
    } else {
      savingRef.current.delete(taskId);
    }

    setSaving(new Set(savingRef.current));
  }

  // Only the one task the user acted on is ever updated, so hidden (filtered) tasks are never touched.
  async function moveTask(task: TaskSummary, status: TaskStatusValue) {
    if (savingRef.current.has(task.id) || statusOf(task) === status) {
      return;
    }

    const restore = () =>
      setMoved((current) => {
        const { [task.id]: _reverted, ...rest } = current;
        return rest;
      });

    setError("");
    setMoved((current) => ({ ...current, [task.id]: status }));
    setTaskSaving(task.id, true);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const reason =
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't update this task right now. Please try again.";

        setTaskSaving(task.id, false);
        restore();
        setError(`“${task.title}” wasn't moved. ${reason}`);

        // The task is gone or no longer ours: reload so the board matches the database.
        if (response.status === 404) {
          router.refresh();
        }

        return;
      }

      setTaskSaving(task.id, false);
      setAnnouncement(`Moved “${task.title}” to ${taskStatusLabels[status]}.`);
      // Re-render from the database; this also drops cached copies of the list and overview.
      router.refresh();
    } catch {
      setTaskSaving(task.id, false);
      restore();
      setError(`“${task.title}” wasn't moved. Unable to reach the server. Check your connection and try again.`);
    }
  }

  // Each column has its own page. Not kept in the address: four numbers there would say little.
  const [columnPages, setColumnPages] = useState<Partial<Record<TaskStatusValue, number>>>({});
  const filterKey = `${deferredQuery}|${projectId}|${priority}|${assignee}|${labelFilter.mode}:${labelIds.join()}`;

  useEffect(() => {
    setColumnPages({});
  }, [filterKey]);

  function clearFilters() {
    setQuery("");
    setProjectId(ALL);
    setPriority(ALL);
    setAssignee(ALL);
    setLabelFilter(NO_LABEL_FILTER);
  }

  return (
    <section aria-labelledby="task-board-heading" className="space-y-5">
      <h2 id="task-board-heading" className="sr-only">
        Task board
      </h2>

      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="board-search" className="sr-only">
            Search tasks by title
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
          />
          <input
            id="board-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks..."
            autoComplete="off"
            className={`${controlClass} pl-9 pr-3 placeholder:text-muted dark:placeholder:text-dark-muted`}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {labels && <LabelFilter labels={labels} value={{ ...labelFilter, ids: labelIds }} onChange={setLabelFilter} />}
          {labelWorkspaces && (
            <ManageLabels
              workspaces={labelWorkspaces}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/20 bg-white px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            />
          )}
          <div className="relative sm:flex-1 xl:w-56 xl:flex-none">
            <label htmlFor="board-project-filter" className="sr-only">
              Filter by project
            </label>
            <select
              id="board-project-filter"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                // The people listed depend on the project, so start again from everyone.
                setAssignee(ALL);
              }}
              className={`${controlClass} appearance-none pl-3 pr-9`}
            >
              <option value={ALL}>All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className={chevronClass} />
        </div>

        <div className="relative sm:flex-1 xl:w-48 xl:flex-none">
          <label htmlFor="board-assignee-filter" className="sr-only">
            Filter by assignee
          </label>
          <select
            id="board-assignee-filter"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            className={`${controlClass} appearance-none pl-3 pr-9`}
          >
            <option value={ALL}>All assignees</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className={chevronClass} />
        </div>

        <div className="relative sm:flex-1 xl:w-44 xl:flex-none">
          <label htmlFor="board-priority-filter" className="sr-only">
            Filter by priority
          </label>
          <select
            id="board-priority-filter"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriorityValue | typeof ALL)}
            className={`${controlClass} appearance-none pl-3 pr-9`}
          >
            <option value={ALL}>All priorities</option>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {taskPriorityLabels[value]} priority
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className={chevronClass} />
        </div>
        </div>
      </div>

      {filtered && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted dark:text-dark-muted">
          <p>
            {visibleTasks.length === 0
              ? "No tasks match these filters."
              : `Showing ${visibleTasks.length} of ${tasks.length} tasks.`}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-10 items-center rounded-lg border border-ink/15 bg-white px-3 font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
          >
            Clear filters
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <p className="min-w-0 flex-1 break-words py-1">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:bg-red-500/20"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/* Phones scroll the columns sideways; tablets show two per row; wide screens all four.
          relative keeps the visually hidden labels inside the scroll area, not the page. */}
      <div className="relative flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const columnTasks = visibleTasks.filter((task) => statusOf(task) === status);
          const paged = paginate(columnTasks, columnPages[status] ?? 1, BOARD_COLUMN_PAGE_SIZE);
          const dragged = draggingId ? tasks.find((task) => task.id === draggingId) : undefined;
          const isDropTarget = dropTarget === status && dragged !== undefined && statusOf(dragged) !== status;

          return (
            <section
              key={status}
              aria-labelledby={`board-column-${status}`}
              onDragOver={(event) => {
                if (draggingId) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(status);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget((current) => (current === status ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropTarget(null);
                setDraggingId(null);

                if (dragged) {
                  void moveTask(dragged, status);
                }
              }}
              className={`flex w-[min(85vw,20rem)] shrink-0 snap-start flex-col rounded-2xl border p-3 motion-safe:transition-colors md:w-auto ${
                isDropTarget
                  ? "border-brand bg-brand/10 dark:bg-brand/15"
                  : "border-transparent bg-ink/5 dark:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${taskStatusColors[status].dot}`} />
                <h3
                  id={`board-column-${status}`}
                  className="font-display text-base font-semibold text-ink dark:text-slate-50"
                >
                  {taskStatusLabels[status]}
                </h3>
                <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-muted dark:bg-dark-surface dark:text-dark-muted">
                  {columnTasks.length}
                  <span className="sr-only">{columnTasks.length === 1 ? " task" : " tasks"}</span>
                </span>
              </div>

              {columnTasks.length === 0 ? (
                <p className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed border-ink/15 px-3 text-center text-sm text-muted dark:border-white/15 dark:text-dark-muted">
                  {isDropTarget ? "Drop to move here" : "No tasks"}
                </p>
              ) : (
                <ul className="flex min-h-24 flex-1 flex-col gap-3">
                  {paged.items.map((task) => {
                    const isSaving = saving.has(task.id);

                    return (
                      <li
                        key={task.id}
                        draggable={!isSaving}
                        aria-busy={isSaving}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", task.title);
                          setDraggingId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        className={`rounded-xl border border-ink/10 bg-white p-3 shadow-sm motion-safe:transition-opacity dark:border-white/10 dark:bg-dark-surface ${
                          isSaving ? "cursor-progress opacity-60" : "cursor-grab active:cursor-grabbing"
                        } ${draggingId === task.id ? "opacity-50 ring-2 ring-brand" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted/70 dark:text-dark-muted/70"
                          />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/dashboard/tasks/${task.id}`}
                              draggable={false}
                              className="break-words rounded text-sm font-medium text-ink hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50 dark:hover:text-brand"
                            >
                              {task.title}
                            </Link>
                            <p className="mt-1 truncate text-xs text-muted dark:text-dark-muted">
                              <span className="sr-only">Project: </span>
                              {task.project.name}
                            </p>
                            {task.parent && (
                              <p className="mt-1 break-words text-xs text-muted dark:text-dark-muted">
                                Subtask of {task.parent.title}
                              </p>
                            )}
                            {task.subtasks.total > 0 && (
                              <p className="mt-1 text-xs text-muted dark:text-dark-muted">
                                {task.subtasks.completed} of {task.subtasks.total}{" "}
                                {task.subtasks.total === 1 ? "subtask" : "subtasks"} completed
                              </p>
                            )}
                            <LabelList labels={task.labels} className="mt-2" />
                          </div>
                        </div>

                        <p className="mt-3 flex items-center text-xs">
                          <span className="sr-only">Assignee: </span>
                          <TaskAssignee assignee={task.assignee} compact />
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="sr-only">Priority: </span>
                            <TaskPriorityBadge priority={task.priority} />
                          </span>
                          <p className="text-xs text-muted dark:text-dark-muted">
                            Updated <FormattedDate value={task.updatedAt} />
                          </p>
                        </div>

                        <div className="relative mt-3">
                          <label htmlFor={`board-move-${task.id}`} className="sr-only">
                            Move {task.title} to
                          </label>
                          <select
                            id={`board-move-${task.id}`}
                            value={status}
                            disabled={isSaving}
                            onChange={(event) => void moveTask(task, event.target.value as TaskStatusValue)}
                            className="min-h-10 w-full appearance-none rounded-lg border border-ink/15 bg-paper pl-3 pr-9 text-xs font-medium text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-progress dark:border-white/15 dark:bg-dark-background dark:text-slate-100"
                          >
                            {TASK_STATUSES.map((option) => (
                              <option key={option} value={option}>
                                {option === status
                                  ? isSaving
                                    ? `Saving: ${taskStatusLabels[option]}...`
                                    : taskStatusLabels[option]
                                  : `Move to ${taskStatusLabels[option]}`}
                              </option>
                            ))}
                          </select>
                          <ChevronDown aria-hidden="true" className={chevronClass} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {/* A card dropped on the column lands in it whichever of its pages is showing. */}
              {paged.pageCount > 1 && (
                <div className="mt-3">
                  <Pagination
                    {...paged}
                    compact
                    noun={`${taskStatusLabels[status].toLowerCase()} tasks`}
                    onChange={(next) => setColumnPages((current) => ({ ...current, [status]: next }))}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
