import type { Metadata } from "next";
import { Suspense } from "react";

import ReportsView from "@/components/dashboard/ReportsView";
import { requireDashboardUser } from "@/lib/dashboard";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { listTeamMembersByTeam, listTeamsForUser } from "@/lib/teams";
import ReportsLoading from "./loading";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  const user = await requireDashboardUser("/dashboard/reports");
  // Only what the filters offer, all scoped to the session user; the figures themselves are
  // counted per request by /api/reports. Failures surface through app/dashboard/error.tsx.
  const [projects, teams, teamMembers] = await Promise.all([
    listProjectOptionsForOwner(user.id),
    listTeamsForUser(user.id),
    listTeamMembersByTeam(user.id),
  ]);

  return (
    // The range and filters are read from the address inside (useSearchParams).
    <Suspense fallback={<ReportsLoading />}>
      <ReportsView
        userId={user.id}
        projects={projects}
        teams={teams.map(({ id, name }) => ({ id, name }))}
        teamMembers={teamMembers}
      />
    </Suspense>
  );
}
