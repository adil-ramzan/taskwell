import type { Metadata } from "next";
import { Suspense } from "react";

import CalendarView from "@/components/dashboard/CalendarView";
import { requireDashboardUser } from "@/lib/dashboard";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { listTeamMembersByTeam, listTeamsForUser } from "@/lib/teams";
import CalendarLoading from "./loading";

export const metadata: Metadata = {
  title: "Calendar",
};

export default async function CalendarPage() {
  const user = await requireDashboardUser("/dashboard/calendar");
  // Only what the filters offer, all scoped to the session user; the tasks themselves are
  // loaded per visible range from /api/calendar. Failures surface through app/dashboard/error.tsx.
  const [projects, teams, teamMembers] = await Promise.all([
    listProjectOptionsForOwner(user.id),
    listTeamsForUser(user.id),
    listTeamMembersByTeam(user.id),
  ]);

  return (
    // The view, day and filters are read from the address inside (useSearchParams).
    <Suspense fallback={<CalendarLoading />}>
      <CalendarView
        userId={user.id}
        projects={projects}
        teams={teams.map(({ id, name }) => ({ id, name }))}
        teamMembers={teamMembers}
      />
    </Suspense>
  );
}
