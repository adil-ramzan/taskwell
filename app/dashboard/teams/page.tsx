import { Mail, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import CreateTeamButton from "@/components/dashboard/CreateTeamButton";
import EmptyState from "@/components/dashboard/EmptyState";
import FormattedDate from "@/components/dashboard/FormattedDate";
import InvitationActions from "@/components/dashboard/InvitationActions";
import PageIntro from "@/components/dashboard/PageIntro";
import TeamRoleBadge from "@/components/dashboard/TeamRoleBadge";
import { requireDashboardUser } from "@/lib/dashboard";
import { teamRoleLabels } from "@/lib/team-validation";
import { listInvitationsForUser, listTeamsForUser } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Teams",
};

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";
const cardClass =
  "rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export default async function TeamsPage() {
  const user = await requireDashboardUser("/dashboard/teams");
  // Only teams the session user belongs to, and invitations addressed to their
  // account's email; failures surface through app/dashboard/error.tsx.
  const [teams, invitations] = await Promise.all([listTeamsForUser(user.id), listInvitationsForUser(user.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro title="Teams" description="Share projects and their tasks with the people you work with." />
        <CreateTeamButton className={createButtonClass}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create team
        </CreateTeamButton>
      </div>

      {invitations.length > 0 && (
        <section aria-labelledby="pending-invitations-heading" className={`${cardClass} p-5`}>
          <h2
            id="pending-invitations-heading"
            className="flex items-center gap-2 font-display text-lg font-semibold text-ink dark:text-slate-50"
          >
            <Mail aria-hidden="true" className="h-5 w-5 text-brand" />
            Invitations for you
          </h2>
          <ul className="mt-3 divide-y divide-ink/10 dark:divide-white/10">
            {invitations.map((invitation) => (
              <li
                key={invitation.token}
                className="flex flex-col gap-3 py-4 last:pb-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium text-ink dark:text-slate-50">{invitation.teamName}</p>
                  <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                    Join as {teamRoleLabels[invitation.role]} · Expires <FormattedDate value={invitation.expiresAt} />
                  </p>
                </div>
                <InvitationActions token={invitation.token} teamName={invitation.teamName} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {teams.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="Create a team to share projects and tasks, or accept an invitation to join one."
          >
            <CreateTeamButton className={`${createButtonClass} dark:focus-visible:ring-offset-dark-surface`}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create team
            </CreateTeamButton>
          </EmptyState>
        </div>
      ) : (
        <section aria-labelledby="team-list-heading">
          <h2 id="team-list-heading" className="sr-only">
            Your teams
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <li key={team.id} className="min-w-0">
                <article aria-labelledby={`team-${team.id}`} className={`${cardClass} flex h-full flex-col p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      id={`team-${team.id}`}
                      className="min-w-0 break-words font-display text-lg font-semibold text-ink dark:text-slate-50"
                    >
                      {team.name}
                    </h3>
                    <span>
                      <span className="sr-only">Your role: </span>
                      <TeamRoleBadge role={team.role} />
                    </span>
                  </div>
                  <p
                    className={`mb-5 mt-2 line-clamp-3 break-words text-sm ${
                      team.description
                        ? "text-muted dark:text-dark-muted"
                        : "italic text-muted dark:text-dark-muted"
                    }`}
                  >
                    {team.description ?? "No description"}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink/10 pt-4 dark:border-white/10">
                    <p className="text-sm text-muted dark:text-dark-muted">
                      {plural(team.memberCount, "member")} · {plural(team.projectCount, "project")}
                    </p>
                    <Link
                      href={`/dashboard/teams/${team.id}`}
                      aria-label={`Open ${team.name}`}
                      className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-ink/15 px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:text-slate-100"
                    >
                      Open
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
