import type { AvatarRef } from "@/lib/avatars";
import UserAvatar from "./UserAvatar";

interface TaskAssigneeProps {
  assignee: { name: string; email: string; avatar?: AvatarRef | null } | null;
  /** Smaller avatar for board cards. */
  compact?: boolean;
}

/** Avatar plus name, or "Unassigned"; the name is always shown as text. */
export default function TaskAssignee({ assignee, compact = false }: TaskAssigneeProps) {
  if (!assignee) {
    return <span className="text-muted dark:text-dark-muted">Unassigned</span>;
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <UserAvatar name={assignee.name} email={assignee.email} avatar={assignee.avatar} size={compact ? "xs" : "sm"} />
      <span className="truncate text-ink dark:text-slate-100">{assignee.name}</span>
    </span>
  );
}
