import { FolderKanban, ListChecks, Plus, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CreateProjectButton from "@/components/dashboard/CreateProjectButton";
import EmptyState from "@/components/dashboard/EmptyState";
import ProjectsView from "@/components/dashboard/ProjectsView";
import StatCard from "@/components/dashboard/StatCard";
import TeamHeader from "@/components/dashboard/TeamHeader";
import TeamRoleBadge from "@/components/dashboard/TeamRoleBadge";
import UserAvatar from "@/components/dashboard/UserAvatar";
import { requireDashboardUser } from "@/lib/dashboard";
import { listProjectsForTeam } from "@/lib/projects";
import { getTeamWorkload } from "@/lib/tasks";
import { canManageTeam, teamRoleLabels } from "@/lib/team-validation";
import { getTeamForUser, listTeamMembersForUser } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Team",
};

const MEMBER_PREVIEW = 5;

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";
const cardClass =
  "rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface";
const textLinkClass =
  "rounded text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50";

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const user = await requireDashboardUser(`/dashboard/teams/${params.teamId}`);
  // Each query checks the session user's membership; a non-member gets not found.
  const [team, members, projects, workload] = await Promise.all([
    getTeamForUser(user.id, params.teamId),
    listTeamMembersForUser(user.id, params.teamId),
    listProjectsForTeam(user.id, params.teamId),
    // Assigned/completed counts for all members in one grouped query.
    getTeamWorkload(user.id, params.teamId),
  ]);

  if (!team || !members) {
    notFound();
  }

  const canManage = canManageTeam(team.role);
  const createProjectButton = (className: string) => (
    <CreateProjectButton teams={[{ id: team.id, name: team.name }]} defaultTeamId={team.id} className={className}>
      <Plus aria-hidden="true" className="h-4 w-4" />
      Create project
    </CreateProjectButton>
  );

  return (
    <div className="space-y-6">
      <TeamHeader team={team} active="overview" />

      <section aria-label="Team summary" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Members" icon={Users} value={team.memberCount} description="People with access to this team." />
        <StatCard
          label="Projects"
          icon={ListChecks}
          value={team.projectCount}
          description="Shared with every member."
        />
        <StatCard
          label="Your role"
          icon={ShieldCheck}
          value={teamRoleLabels[team.role]}
          description={canManage ? "You can manage members and projects." : "You can work on the team's tasks."}
        />
      </section>

      <section aria-labelledby="team-members-heading" className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="team-members-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Members and workload
          </h2>
          <Link href={`/dashboard/teams/${team.id}/members`} className={`${textLinkClass} inline-flex min-h-6 items-center`}>
            {canManage ? "Manage members" : "View all members"}
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-ink/10 dark:divide-white/10">
          {members.slice(0, MEMBER_PREVIEW).map((member) => {
            const { assigned, completed } = workload.get(member.userId) ?? { assigned: 0, completed: 0 };

            return (
              <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 last:pb-0">
                <UserAvatar name={member.name} email={member.email} avatar={member.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink dark:text-slate-50">
                    {member.name}
                    {member.isSelf && <span className="font-normal text-muted dark:text-dark-muted"> (you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted dark:text-dark-muted">{member.email}</p>
                </div>
                <p className="order-last w-full pl-11 text-xs text-muted dark:text-dark-muted sm:order-none sm:w-auto sm:pl-0">
                  <span className="font-medium text-ink dark:text-slate-100">{assigned}</span> assigned ·{" "}
                  <span className="font-medium text-ink dark:text-slate-100">{completed}</span> completed
                </p>
                <TeamRoleBadge role={member.role} />
              </li>
            );
          })}
        </ul>
        {members.length > MEMBER_PREVIEW && (
          <p className="mt-3 text-sm text-muted dark:text-dark-muted">
            And {members.length - MEMBER_PREVIEW} more.
          </p>
        )}
        {members.length === 1 && (
          <p className="mt-3 text-sm text-muted dark:text-dark-muted">
            {canManage ? (
              <>
                It&apos;s just you so far.{" "}
                <Link href={`/dashboard/teams/${team.id}/members`} className={textLinkClass}>
                  Invite someone
                </Link>{" "}
                to share this team&apos;s projects.
              </>
            ) : (
              "It's just you so far."
            )}
          </p>
        )}
      </section>

      <section aria-labelledby="team-projects-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="team-projects-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Team projects
          </h2>
          {canManage && projects.length > 0 && createProjectButton(createButtonClass)}
        </div>

        {projects.length === 0 ? (
          <div className={cardClass}>
            <EmptyState
              icon={FolderKanban}
              title="No team projects yet"
              description={
                canManage
                  ? "Create a project here and every member of the team can work on its tasks."
                  : "A team owner or admin can create projects for this team."
              }
            >
              {canManage && createProjectButton(`${createButtonClass} dark:focus-visible:ring-offset-dark-surface`)}
            </EmptyState>
          </div>
        ) : (
          <ProjectsView projects={projects} showScope={false} />
        )}
      </section>
    </div>
  );
}
