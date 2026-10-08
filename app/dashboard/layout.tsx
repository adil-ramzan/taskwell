import type { Metadata } from "next";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { AssignmentProvider } from "@/components/dashboard/AssignmentContext";
import { CommandPaletteButton, CommandPaletteProvider } from "@/components/dashboard/CommandPalette";
import MobileDrawer from "@/components/dashboard/MobileDrawer";
import NotificationBell, { NotificationsProvider } from "@/components/dashboard/Notifications";
import Sidebar from "@/components/dashboard/Sidebar";
import { TimeZoneProvider } from "@/components/dashboard/TimeZoneContext";
import { requireDashboardUser } from "@/lib/dashboard";
import { countUnreadNotifications } from "@/lib/notifications";
import { listProjectOptionsForOwner } from "@/lib/projects";
import { canManageTeam } from "@/lib/team-validation";
import { listAssignableMembersByTeam, listTeamsForUser } from "@/lib/teams";
import { describeError } from "@/lib/users";

export const metadata: Metadata = {
  title: {
    template: "%s | Taskwell",
    default: "Dashboard | Taskwell",
  },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboardUser("/dashboard");
  // For the sidebar's Create task and Create project dialogs. A failure is logged
  // and the dialogs degrade (no project list / personal projects only) instead of
  // breaking every dashboard page.
  const [projects, teams, assignableMembers, unreadNotifications] = await Promise.all([
    listProjectOptionsForOwner(user.id).catch((error: unknown) => {
      console.error("[projects] Sidebar project options failed:", describeError(error));
      return null;
    }),
    listTeamsForUser(user.id).catch((error: unknown) => {
      console.error("[teams] Sidebar teams failed:", describeError(error));
      return [];
    }),
    // Who the user may assign tasks to, for every task dialog and assignee control.
    listAssignableMembersByTeam(user.id).catch((error: unknown) => {
      console.error("[teams] Assignable members failed:", describeError(error));
      return {};
    }),
    // The bell's first unread count; it re-checks on its own afterwards.
    countUnreadNotifications(user.id).catch((error: unknown) => {
      console.error("[notifications] Unread count failed:", describeError(error));
      return 0;
    }),
  ]);
  // user.timeZone (Settings) is provided below for every due date shown or entered in the dashboard.
  const manageableTeams = teams.filter((team) => canManageTeam(team.role)).map(({ id, name }) => ({ id, name }));
  // The drawer's copy has no search button: below lg it sits in the top bar instead.
  const sidebar = (search?: React.ReactNode) => (
    <Sidebar
      name={user.name}
      email={user.email}
      avatar={user.avatar}
      projects={projects}
      teams={manageableTeams}
      search={search}
    />
  );

  return (
    <TimeZoneProvider value={user.timeZone}>
      <AssignmentProvider value={assignableMembers}>
        <NotificationsProvider initialCount={unreadNotifications}>
          {/* Ctrl/Cmd+K and the search buttons below; the palette opens the same create dialogs as the sidebar. */}
          <CommandPaletteProvider userId={user.id} projects={projects} teams={manageableTeams}>
            <div id="dashboard-shell" className="min-h-screen bg-paper dark:bg-dark-background">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
              >
                Skip to main content
              </a>

              <div className="flex min-h-screen">
                {/* z-30 lets the notification panel open over the page content. */}
                <aside className="sticky top-0 z-30 hidden h-screen w-[260px] shrink-0 border-r border-ink/10 bg-white dark:border-white/10 dark:bg-dark-surface lg:block">
                  {sidebar(<CommandPaletteButton variant="bar" />)}
                  {/* Beside the logo, in the slot the drawer uses for its close button. */}
                  <div className="absolute right-3 top-3">
                    <NotificationBell />
                  </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                  {/* Below lg the sidebar lives in a drawer opened from this bar. */}
                  <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink/10 bg-white px-4 dark:border-white/10 dark:bg-dark-surface sm:px-6 lg:hidden">
                    <MobileDrawer>{sidebar()}</MobileDrawer>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-2 rounded-md font-display text-lg font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                        <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                      </span>
                      Taskwell
                    </Link>
                    <div className="ml-auto flex items-center">
                      <CommandPaletteButton variant="icon" />
                      <NotificationBell />
                    </div>
                  </header>

                  <main
                    id="main-content"
                    tabIndex={-1}
                    className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8"
                  >
                    {children}
                  </main>
                </div>
              </div>
            </div>
          </CommandPaletteProvider>
        </NotificationsProvider>
      </AssignmentProvider>
    </TimeZoneProvider>
  );
}
