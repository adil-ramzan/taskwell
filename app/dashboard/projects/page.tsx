import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";

import CreateProjectButton from "@/components/dashboard/CreateProjectButton";
import EmptyState from "@/components/dashboard/EmptyState";
import PageIntro from "@/components/dashboard/PageIntro";
import ProjectsView from "@/components/dashboard/ProjectsView";
import { requireDashboardUser } from "@/lib/dashboard";
import { listProjectsForOwner } from "@/lib/projects";
import { canManageTeam } from "@/lib/team-validation";
import { listTeamsForUser } from "@/lib/teams";

export const metadata: Metadata = {
  title: "Projects",
};

const createButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background";

export default async function ProjectsPage() {
  const user = await requireDashboardUser("/dashboard/projects");
  // Personal projects plus the projects of the user's teams; failures surface
  // through app/dashboard/error.tsx.
  const [projects, allTeams] = await Promise.all([listProjectsForOwner(user.id), listTeamsForUser(user.id)]);
  // Only owners and admins can create projects in a team.
  const teams = allTeams.filter((team) => canManageTeam(team.role)).map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro title="Projects" description="Manage and organize your personal and team projects." />
        <CreateProjectButton teams={teams} className={createButtonClass}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create project
        </CreateProjectButton>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to start organizing your work."
          >
            <CreateProjectButton
              teams={teams}
              className={`${createButtonClass} dark:focus-visible:ring-offset-dark-surface`}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create project
            </CreateProjectButton>
          </EmptyState>
        </div>
      ) : (
        <ProjectsView projects={projects} />
      )}
    </div>
  );
}
