import { teamRoleLabels, type TeamRoleValue } from "@/lib/team-validation";

const roleClasses: Record<TeamRoleValue, string> = {
  OWNER: "bg-accent/15 text-ink dark:bg-accent/20 dark:text-slate-50",
  ADMIN: "bg-brand/10 text-brand-dark dark:bg-brand/25 dark:text-slate-50",
  MEMBER: "bg-ink/5 text-muted dark:bg-white/5 dark:text-dark-muted",
};

export default function TeamRoleBadge({ role }: { role: TeamRoleValue }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${roleClasses[role]}`}
    >
      {teamRoleLabels[role]}
    </span>
  );
}
