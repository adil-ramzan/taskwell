import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { TeamSummary } from "@/lib/teams";
import { canManageTeam } from "@/lib/team-validation";
import { backLinkClass, cardClass } from "./detail-styles";
import TeamRoleBadge from "./TeamRoleBadge";

type TeamTab = "overview" | "members" | "settings";

/** Shared top of the team pages: back link, name, the user's role, and the section tabs. */
export default function TeamHeader({ team, active }: { team: TeamSummary; active: TeamTab }) {
  const base = `/dashboard/teams/${team.id}`;
  const tabs: { key: TeamTab; label: string; href: string }[] = [
    { key: "overview", label: "Overview", href: base },
    { key: "members", label: "Members", href: `${base}/members` },
    // Members can't change team settings, so they don't get the tab.
    ...(canManageTeam(team.role) ? [{ key: "settings" as const, label: "Settings", href: `${base}/settings` }] : []),
  ];

  return (
    <div className="space-y-4">
      <Link href="/dashboard/teams" className={backLinkClass}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to teams
      </Link>

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words font-display text-2xl font-bold text-ink dark:text-slate-50 sm:text-3xl">
            {team.name}
          </h1>
          <p>
            <span className="sr-only">Your role: </span>
            <TeamRoleBadge role={team.role} />
          </p>
        </div>
        <p
          className={`mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm ${
            team.description ? "text-muted dark:text-dark-muted" : "italic text-muted dark:text-dark-muted"
          }`}
        >
          {team.description ?? "No description"}
        </p>
      </div>

      <nav aria-label="Team sections" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1 dark:bg-white/5">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active === tab.key ? "page" : undefined}
            className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              active === tab.key
                ? "bg-brand text-white shadow-sm"
                : "text-muted hover:text-ink dark:text-dark-muted dark:hover:text-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
