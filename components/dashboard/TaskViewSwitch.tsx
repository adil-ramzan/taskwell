import { Kanban, LayoutList, UserCheck } from "lucide-react";
import Link from "next/link";

const views = [
  { key: "list", label: "List", href: "/dashboard/tasks", icon: LayoutList },
  { key: "board", label: "Board", href: "/dashboard/tasks/board", icon: Kanban },
  { key: "my", label: "My tasks", href: "/dashboard/tasks/my", icon: UserCheck },
] as const;

/** Switches between the task list, the Kanban board and My tasks; styled like the status filter pills. */
export default function TaskViewSwitch({ active }: { active: (typeof views)[number]["key"] }) {
  return (
    <nav aria-label="Task view" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1 dark:bg-white/5">
      {views.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            active === key
              ? "bg-brand text-white shadow-sm"
              : "text-muted hover:text-ink dark:text-dark-muted dark:hover:text-slate-50"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
