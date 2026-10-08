import {
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-validation";

/** Dot classes plus matching hex values (Tailwind accent, brand, violet-500, emerald-500) for charts. */
export const taskStatusColors: Record<TaskStatusValue, { dot: string; hex: string }> = {
  TODO: { dot: "bg-accent", hex: "#F2A93B" },
  IN_PROGRESS: { dot: "bg-brand", hex: "#2F6FED" },
  IN_REVIEW: { dot: "bg-violet-500", hex: "#8B5CF6" },
  COMPLETED: { dot: "bg-emerald-500", hex: "#10B981" },
};

const priorityClasses: Record<TaskPriorityValue, string> = {
  LOW: "bg-ink/5 text-muted dark:bg-white/5 dark:text-dark-muted",
  MEDIUM: "bg-brand/10 text-brand-dark dark:bg-brand/25 dark:text-slate-50",
  HIGH: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const pillClass = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium";

export function TaskStatusBadge({ status }: { status: TaskStatusValue }) {
  return (
    <span className={`${pillClass} bg-ink/5 text-ink dark:bg-white/5 dark:text-slate-100`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${taskStatusColors[status].dot}`} />
      {taskStatusLabels[status]}
    </span>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriorityValue }) {
  return <span className={`${pillClass} ${priorityClasses[priority]}`}>{taskPriorityLabels[priority]}</span>;
}
