import { Activity, CheckCheck, ClipboardCheck, ListChecks, Plus } from "lucide-react";
import type { Metadata } from "next";

import ActivityChart from "@/components/dashboard/ActivityChart";
import AnalyticsScopeSelect from "@/components/dashboard/AnalyticsScopeSelect";
import CreateTaskButton from "@/components/dashboard/CreateTaskButton";
import PageIntro from "@/components/dashboard/PageIntro";
import PriorityDistribution from "@/components/dashboard/PriorityDistribution";
import ProjectStats from "@/components/dashboard/ProjectStats";
import StatCard from "@/components/dashboard/StatCard";
import StatusDistribution from "@/components/dashboard/StatusDistribution";
import TaskReviewList from "@/components/dashboard/TaskReviewList";
import { resolveAnalyticsScope } from "@/lib/analytics";
import { getDashboardOverview, requireDashboardUser } from "@/lib/dashboard";
import { listTeamsForUser } from "@/lib/teams";
import { describeError } from "@/lib/users";

// The layout's "%s | Taskwell" template only applies to nested segments, not this page.
export const metadata: Metadata = {
  title: { absolute: "Dashboard | Taskwell" },
};

interface DashboardPageProps {
  searchParams: { scope?: string | string[] };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireDashboardUser("/dashboard");
  // The user's own teams (shared with the layout's query). The scope in the URL
  // is only honoured if it names one of them; anything else means "all".
  const teams = await listTeamsForUser(user.id).catch((error: unknown) => {
    console.error("[teams] Dashboard teams failed:", describeError(error));
    return [];
  });
  const requested = Array.isArray(searchParams.scope) ? searchParams.scope[0] : searchParams.scope;
  const scope = resolveAnalyticsScope(
    requested,
    teams.map((team) => team.id),
  );
  const scopeTeam = typeof scope === "object" ? teams.find((team) => team.id === scope.teamId) : undefined;
  const { analytics, projects } = await getDashboardOverview(user.id, scope);
  // One set of status counts feeds the cards and the donut.
  const counts = analytics?.statusCounts ?? null;
  const total = counts ? counts.TODO + counts.IN_PROGRESS + counts.IN_REVIEW + counts.COMPLETED : null;
  const where = scopeTeam ? `In ${scopeTeam.name}.` : scope === "personal" ? "In your personal projects." : null;

  return (
    <div className="space-y-6 sm:space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageIntro title="Dashboard" description="Track your projects and task progress in one place." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* Without teams, "all" and "personal" are the same thing. */}
          {teams.length > 0 && (
            <AnalyticsScopeSelect
              value={typeof scope === "object" ? scope.teamId : scope}
              teams={teams.map(({ id, name }) => ({ id, name }))}
            />
          )}
          <CreateTaskButton
            projects={projects}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-background"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New task
          </CreateTaskButton>
        </div>
      </div>

      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="sr-only">
          Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total tasks"
            icon={Activity}
            value={total}
            description={where ?? "Across all of your projects."}
          />
          <StatCard
            label="In progress"
            icon={ListChecks}
            value={counts?.IN_PROGRESS ?? null}
            description="Work currently underway."
          />
          <StatCard
            label="In review"
            icon={ClipboardCheck}
            value={counts?.IN_REVIEW ?? null}
            description="Submitted work awaiting review."
          />
          <StatCard
            label="Completed"
            icon={CheckCheck}
            value={counts?.COMPLETED ?? null}
            description={where ? "Completed tasks in this view." : "Completed tasks in this workspace."}
          />
        </div>
      </section>

      <section aria-label="Workspace analytics" className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
        <ActivityChart months={analytics?.months ?? null} undatedCompleted={analytics?.undatedCompleted ?? 0} />
        <StatusDistribution counts={counts} />
        <ProjectStats projects={analytics?.projects ?? null} projectCount={analytics?.projectCount ?? 0} />
        <PriorityDistribution counts={analytics?.priorityCounts ?? null} />
      </section>

      <TaskReviewList tasks={analytics?.reviewTasks ?? null} total={counts?.IN_REVIEW ?? 0} />
    </div>
  );
}
