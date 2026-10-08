import Link from "next/link";

import type { ReviewTask } from "@/lib/analytics";
import RelativeTime from "./RelativeTime";
import TaskAssignee from "./TaskAssignee";
import { TaskPriorityBadge } from "./TaskBadges";

interface TaskReviewListProps {
  /** The most recently updated tasks in review; null when the data couldn't be loaded. */
  tasks: ReviewTask[] | null;
  /** All tasks in review in the current scope. */
  total: number;
}

const linkClass =
  "rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50";

/** The tasks currently In review that the user can access, most recently updated first. */
export default function TaskReviewList({ tasks, total }: TaskReviewListProps) {
  return (
    <section
      aria-labelledby="task-review-heading"
      className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-4 dark:border-white/10 sm:px-5">
        <h2 id="task-review-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
          Task review list
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-muted dark:bg-white/5 dark:text-dark-muted">
            {tasks === null ? "Unavailable" : total === 0 ? "Nothing in review" : `${total} in review`}
          </span>
          <Link href="/dashboard/tasks" className={`${linkClass} inline-flex min-h-6 items-center text-sm`}>
            View all tasks
          </Link>
        </div>
      </div>

      {tasks === null || tasks.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-medium text-ink dark:text-slate-100">
            {tasks === null ? "The review list is unavailable" : "Nothing to review"}
          </p>
          <p className="mt-1 text-sm text-muted dark:text-dark-muted">
            {tasks === null
              ? "We couldn't load these tasks. Try again in a moment."
              : "Tasks appear here when their status is In review."}
          </p>
        </div>
      ) : (
        <>
          {/* Below md each task is a stacked row (no sideways scrolling); from md up it is a table. */}
          <table className="block w-full border-collapse text-left text-sm md:table">
            <caption className="sr-only">Tasks in review, most recently updated first</caption>
            <thead className="hidden bg-paper text-xs font-medium text-muted dark:bg-dark-background dark:text-dark-muted md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Task</th>
                <th scope="col" className="px-4 py-3 font-medium">Project</th>
                <th scope="col" className="px-4 py-3 font-medium">Assignee</th>
                <th scope="col" className="px-4 py-3 font-medium">Priority</th>
                <th scope="col" className="px-4 py-3 font-medium md:pr-5">Last updated</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-ink/10 dark:divide-white/10 md:table-row-group">
              {tasks.map((task) => (
                <tr key={task.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4 md:table-row md:p-0">
                  <th scope="row" className="block w-full min-w-0 text-left font-normal md:table-cell md:w-auto md:max-w-xs md:px-5 md:py-3">
                    <Link href={`/dashboard/tasks/${task.id}`} className={`${linkClass} break-words [overflow-wrap:anywhere]`}>
                      {task.title}
                    </Link>
                  </th>
                  <td className="block w-full min-w-0 break-words text-muted [overflow-wrap:anywhere] dark:text-dark-muted md:table-cell md:w-auto md:max-w-[14rem] md:px-4 md:py-3">
                    <span className="md:hidden">In </span>
                    {task.project.name}
                  </td>
                  <td className="block min-w-0 max-w-full md:table-cell md:max-w-[12rem] md:px-4 md:py-3">
                    <span className="sr-only md:hidden">Assignee: </span>
                    <TaskAssignee assignee={task.assignee} compact />
                  </td>
                  <td className="block md:table-cell md:px-4 md:py-3">
                    <span className="sr-only md:hidden">Priority: </span>
                    <TaskPriorityBadge priority={task.priority} />
                  </td>
                  <td className="block w-full text-xs text-muted dark:text-dark-muted md:table-cell md:w-auto md:whitespace-nowrap md:px-4 md:py-3 md:pr-5 md:text-sm">
                    <span className="md:hidden">Updated </span>
                    <RelativeTime value={task.updatedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > tasks.length && (
            <p className="border-t border-ink/10 px-4 py-3 text-xs text-muted dark:border-white/10 dark:text-dark-muted sm:px-5">
              Showing the {tasks.length} most recently updated of {total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
