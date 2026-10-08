import { Lock, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ConfirmDeleteButton from "@/components/dashboard/ConfirmDeleteButton";
import EmptyState from "@/components/dashboard/EmptyState";
import TeamHeader from "@/components/dashboard/TeamHeader";
import TeamSettingsForm from "@/components/dashboard/TeamSettingsForm";
import { deleteButtonClass } from "@/components/dashboard/detail-styles";
import { requireDashboardUser } from "@/lib/dashboard";
import { canManageTeam } from "@/lib/team-validation";
import { getTeamForUser } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Team settings",
};

const cardClass =
  "rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-6";
const headingClass = "font-display text-lg font-semibold text-ink dark:text-slate-50";

export default async function TeamSettingsPage({ params }: { params: { teamId: string } }) {
  const user = await requireDashboardUser(`/dashboard/teams/${params.teamId}/settings`);
  const team = await getTeamForUser(user.id, params.teamId);

  if (!team) {
    notFound();
  }

  // Members get no settings controls at all; the API enforces the same rule.
  if (!canManageTeam(team.role)) {
    return (
      <div className="space-y-6">
        <TeamHeader team={team} active="overview" />
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState
            icon={Lock}
            title="Settings are limited to owners and admins"
            description="Ask a team owner or admin if something about this team needs to change."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeamHeader team={team} active="settings" />

      <section aria-labelledby="team-details-heading" className={`${cardClass} max-w-2xl`}>
        <h2 id="team-details-heading" className={`${headingClass} mb-4`}>
          Team details
        </h2>
        {/* The key resets the fields to the saved values after an update. */}
        <TeamSettingsForm key={team.updatedAt} team={team} />
      </section>

      {team.role === "OWNER" && (
        <section
          aria-labelledby="danger-heading"
          className={`${cardClass} max-w-2xl border-red-200 dark:border-red-500/30`}
        >
          <h2 id="danger-heading" className={headingClass}>
            Delete team
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted dark:text-dark-muted">
            Permanently deletes this team for everyone, including its projects and their tasks. Personal projects
            are not affected.
          </p>
          <ConfirmDeleteButton
            className={deleteButtonClass}
            title="Delete team"
            noun="team"
            endpoint={`/api/teams/${team.id}`}
            redirectTo="/dashboard/teams"
            confirmText={team.name}
            description={
              <>
                <p>
                  This permanently deletes{" "}
                  <strong className="font-semibold text-ink dark:text-slate-50">{team.name}</strong> and removes:
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {team.memberCount === 1 ? "its 1 membership" : `all ${team.memberCount} memberships`} (every
                    member loses access)
                  </li>
                  <li>all pending invitations</li>
                  <li>
                    {team.projectCount === 1
                      ? "its 1 team project and every task in it"
                      : `all ${team.projectCount} team projects and every task in them`}
                  </li>
                </ul>
                <p>This can&apos;t be undone.</p>
              </>
            }
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete team
          </ConfirmDeleteButton>
        </section>
      )}
    </div>
  );
}
