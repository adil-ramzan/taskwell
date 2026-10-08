"use client";

import { ChevronDown, ListFilter, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { matchesLabels } from "@/lib/label-rules";
import type { LabelSummary, LabelWorkspace } from "@/lib/labels";
import type { TaskSummary } from "@/lib/tasks";
import type { TeamMembersByTeam } from "@/lib/teams";
import { assigneeOptions } from "./assignee-options";
import { TASK_STATUSES, taskStatusLabels, type TaskStatusValue } from "@/lib/task-validation";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import CreateTaskButton, { type ProjectOption } from "./CreateTaskButton";
import { deleteIconButtonClass, editIconButtonClass } from "./detail-styles";
import EmptyState from "./EmptyState";
import FormattedDate from "./FormattedDate";
import { LabelList } from "./LabelChip";
import LabelFilter, { NO_LABEL_FILTER } from "./LabelFilter";
import ManageLabels from "./ManageLabels";
import Pagination, { useUrlPagination } from "./Pagination";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge, TaskStatusBadge } from "./TaskBadges";

type StatusFilter = "ALL" | TaskStatusValue;

const statusFilters: StatusFilter[] = ["ALL", ...TASK_STATUSES];

/** Tasks per page of the list. */
export const TASKS_PAGE_SIZE = 25;

const ALL_PROJECTS = "";
const ALL_ASSIGNEES = "";
const UNASSIGNED = "unassigned";

const selectClass =
  "min-h-11 w-full appearance-none rounded-lg border border-ink/20 bg-white pl-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";

interface TasksViewProps {
  tasks: TaskSummary[];
  projects: ProjectOption[];
  /** False on a project's own page, where the project filter and column would be redundant. */
  showProject?: boolean;
  /** False on My tasks, where every task has the same assignee. */
  showAssigneeFilter?: boolean;
  /** Members of the user's teams, so the assignee filter also lists people with no tasks. */
  teamMembers?: TeamMembersByTeam;
  /** The labels offered by the label filter; without them the filter isn't shown. */
  labels?: LabelSummary[];
  /** Where labels can be created; with them the Manage labels button is shown. */
  labelWorkspaces?: LabelWorkspace[];
}

const NO_TEAM_MEMBERS: TeamMembersByTeam = {};

export default function TasksView({
  tasks,
  projects,
  showProject = true,
  showAssigneeFilter = true,
  teamMembers = NO_TEAM_MEMBERS,
  labels,
  labelWorkspaces,
}: TasksViewProps) {
  // Which labels, and whether a task needs any one of them or all of them.
  const [labelFilter, setLabelFilter] = useState(NO_LABEL_FILTER);
  // A deleted label can't keep filtering.
  const labelIds = useMemo(
    () => labelFilter.ids.filter((id) => !labels || labels.some((label) => label.id === id)),
    [labelFilter.ids, labels],
  );
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [projectId, setProjectId] = useState(ALL_PROJECTS);
  // "" = everyone, "unassigned", or a user ID.
  const [assignee, setAssignee] = useState(ALL_ASSIGNEES);

  // Filtering is local to the already-loaded tasks; the server already scoped them to this user.
  const inProject = useMemo(
    () => (projectId ? tasks.filter((task) => task.project.id === projectId) : tasks),
    [tasks, projectId],
  );
  // The people offered are the members of the teams in scope: the selected project's
  // team, or (with all projects) the teams of every project in the list.
  const assignees = useMemo(() => {
    const scope = projectId
      ? projects.filter((project) => project.id === projectId)
      : showProject
        ? projects
        : // A project's own page: only the project(s) these tasks belong to.
          tasks.map((task) => task.project);

    return assigneeOptions(inProject, scope.map((project) => project.teamId), teamMembers);
  }, [inProject, projectId, projects, showProject, tasks, teamMembers]);
  // Everything except the status filter; the status counts are taken from this.
  const projectTasks = useMemo(
    () =>
      inProject.filter(
        (task) =>
          (assignee === ALL_ASSIGNEES ||
            (assignee === UNASSIGNED ? task.assignee === null : task.assignee?.id === assignee)) &&
          matchesLabels(
            task.labels.map((label) => label.id),
            labelIds,
            labelFilter.mode,
          ),
      ),
    [inProject, assignee, labelIds, labelFilter.mode],
  );
  const visibleTasks = useMemo(
    () => (status === "ALL" ? projectTasks : projectTasks.filter((task) => task.status === status)),
    [projectTasks, status],
  );
  // The list is already loaded and scoped to this user; pages are cut from it here, after the filters.
  const paged = useUrlPagination(visibleTasks, TASKS_PAGE_SIZE, `${status}|${projectId}|${assignee}|${labelFilter.mode}:${labelIds.join()}`);
  const countFor = (filter: StatusFilter) =>
    filter === "ALL" ? projectTasks.length : projectTasks.filter((task) => task.status === filter).length;

  return (
    <section aria-labelledby="task-list-heading" className="space-y-5">
      <h2 id="task-list-heading" className="sr-only">
        Your tasks
      </h2>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter by status"
          className="flex flex-wrap gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/5 sm:w-fit sm:rounded-full"
        >
          {statusFilters.map((filter) => {
            const active = status === filter;

            return (
              <button
                key={filter}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(filter)}
                className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:text-ink dark:text-dark-muted dark:hover:text-slate-50"
                }`}
              >
                {filter === "ALL" ? "All" : taskStatusLabels[filter]}
                <span className={`text-xs font-normal ${active ? "text-white" : "text-muted dark:text-dark-muted"}`}>{countFor(filter)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
          {labels && <LabelFilter labels={labels} value={{ ...labelFilter, ids: labelIds }} onChange={setLabelFilter} />}
          {labelWorkspaces && (
            <ManageLabels
              workspaces={labelWorkspaces}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink/20 bg-white px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            />
          )}
          {showAssigneeFilter && (
            <div className="relative sm:w-52">
              <label htmlFor="task-assignee-filter" className="sr-only">
                Filter by assignee
              </label>
              <select
                id="task-assignee-filter"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                className={selectClass}
              >
                <option value={ALL_ASSIGNEES}>All assignees</option>
                <option value={UNASSIGNED}>Unassigned</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
              />
            </div>
          )}
          {showProject && (
            <div className="relative sm:w-56">
              <label htmlFor="task-project-filter" className="sr-only">
                Filter by project
              </label>
              <select
                id="task-project-filter"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  // The people listed depend on the project, so start again from everyone.
                  setAssignee(ALL_ASSIGNEES);
                }}
                className={selectClass}
              >
                <option value={ALL_PROJECTS}>All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
              />
            </div>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        {visibleTasks.length === 1 ? "1 task" : `${visibleTasks.length} tasks`}
      </p>

      <div id="task-list" className="scroll-mt-20 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
        {visibleTasks.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title="No tasks match these filters"
            description="Try a different combination of filters."
          >
            <button
              type="button"
              onClick={() => {
                setStatus("ALL");
                setProjectId(ALL_PROJECTS);
                setAssignee(ALL_ASSIGNEES);
                setLabelFilter(NO_LABEL_FILTER);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink/15 bg-white px-5 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-surface dark:text-slate-100"
            >
              Clear filters
            </button>
          </EmptyState>
        ) : (
          // relative keeps the visually hidden labels inside the scroll area, not the page.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <caption className="sr-only">Your tasks</caption>
              <thead className="bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium sm:px-5">Task</th>
                  {showProject && <th scope="col" className="px-4 py-3 font-medium">Project</th>}
                  <th scope="col" className="px-4 py-3 font-medium">Assignee</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                  <th scope="col" className="px-4 py-3 font-medium">Created</th>
                  <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                  <th scope="col" className="px-4 py-3 font-medium sm:pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 dark:divide-white/10">
                {paged.items.map((task) => (
                  <tr key={task.id} className="align-top">
                    <th scope="row" className="max-w-sm px-4 py-4 text-left font-normal sm:px-5">
                      <Link
                        href={`/dashboard/tasks/${task.id}`}
                        className="break-words rounded font-medium text-ink hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50 dark:hover:text-brand"
                      >
                        {task.title}
                      </Link>
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
                      {task.description && (
                        <p className="mt-1 line-clamp-2 break-words text-xs text-muted dark:text-dark-muted">
                          {task.description}
                        </p>
                      )}
                      <LabelList labels={task.labels} className="mt-1.5" />
                    </th>
                    {showProject && (
                      <td className="max-w-[12rem] truncate px-4 py-4 text-ink dark:text-slate-100">
                        {task.project.name}
                      </td>
                    )}
                    <td className="max-w-[12rem] px-4 py-3">
                      <TaskAssignee assignee={task.assignee} />
                    </td>
                    <td className="px-4 py-4">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-4">
                      <TaskPriorityBadge priority={task.priority} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted dark:text-dark-muted">
                      <FormattedDate value={task.createdAt} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted dark:text-dark-muted">
                      <FormattedDate value={task.updatedAt} />
                    </td>
                    <td className="px-4 py-3 sm:pr-5">
                      <div className="flex justify-end gap-2">
                        <CreateTaskButton task={task} projects={projects} className={editIconButtonClass}>
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                          <span className="sr-only">Edit {task.title}</span>
                        </CreateTaskButton>
                        <ConfirmDeleteButton
                          className={deleteIconButtonClass}
                          title="Delete task"
                          noun="task"
                          endpoint={`/api/tasks/${task.id}`}
                          description={
                            <>
                              <p>
                                Delete{" "}
                                <strong className="font-semibold text-ink dark:text-slate-50">{task.title}</strong>{" "}
                                from {task.project.name}?
                              </p>
                              <p>This can&apos;t be undone.</p>
                            </>
                          }
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                          <span className="sr-only">Delete {task.title}</span>
                        </ConfirmDeleteButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination {...paged} noun="tasks" onChange={paged.setPage} scrollToId="task-list" />
    </section>
  );
}
