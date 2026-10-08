import {
  CalendarDays,
  ChartColumn,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Settings,
  SquareKanban,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** False until the feature behind the route is actually implemented. */
  available: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, available: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, available: true },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks, available: true },
  { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplate, available: true },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, available: true },
  { href: "/dashboard/reports", label: "Reports", icon: ChartColumn, available: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, available: true },
];

export function isActiveNavItem(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavItemForPath(pathname: string) {
  return dashboardNavItems.find((item) => isActiveNavItem(pathname, item.href));
}

/** A destination the command palette can jump to. Every signed-in user can open all of them. */
export type PaletteNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra words the palette's filter matches, besides the label. */
  keywords: string;
};

/** The routes the sidebar links to, in the same order. */
export const paletteNavItems: PaletteNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview analytics" },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, keywords: "all projects" },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks, keywords: "all tasks list" },
  { href: "/dashboard/tasks/my", label: "My Tasks", icon: UserCheck, keywords: "assigned to me" },
  { href: "/dashboard/tasks/board", label: "Board", icon: SquareKanban, keywords: "task board kanban" },
  { href: "/dashboard/templates", label: "Templates", icon: LayoutTemplate, keywords: "task templates reuse" },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays, keywords: "due dates schedule" },
  { href: "/dashboard/reports", label: "Reports", icon: ChartColumn, keywords: "exports csv metrics statistics" },
  { href: "/dashboard/teams", label: "Teams", icon: Users, keywords: "members invitations" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, keywords: "account profile password preferences" },
];
