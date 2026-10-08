"use client";

import {
  CalendarDays,
  ChartColumn,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import type { AvatarRef } from "@/lib/avatars";
import { isActiveNavItem } from "@/lib/navigation";
import CreateProjectButton, { type TeamOption } from "./CreateProjectButton";
import CreateTaskButton, { type ProjectOption } from "./CreateTaskButton";
import UserAvatar from "./UserAvatar";

const PROJECTS_PATH = "/dashboard/projects";
const TASKS_PATH = "/dashboard/tasks";
const BOARD_PATH = "/dashboard/tasks/board";
const MY_TASKS_PATH = "/dashboard/tasks/my";

const sectionLabelClass = "px-3 text-xs font-medium uppercase tracking-wide text-muted dark:text-dark-muted";
const itemBase =
  "flex w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
// Compact rows so the whole menu fits a laptop-height window with both groups open.
const itemClass = `${itemBase} min-h-10 py-2`;
// The current page wears the logo's blue.
const activeClass = "bg-brand text-white";
const inactiveClass =
  "text-muted hover:bg-ink/5 hover:text-ink dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50";
// Children sit under their group's label, past its icon.
const childClass = `${itemBase} min-h-9 py-1.5 pl-11`;

function NavLink({
  href,
  active,
  icon: Icon,
  child = false,
  children,
}: {
  href: string;
  active: boolean;
  icon?: LucideIcon;
  child?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${child ? childClass : itemClass} ${active ? activeClass : inactiveClass}`}
    >
      {Icon && <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />}
      {children}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  active,
  children,
}: {
  label: string;
  icon: LucideIcon;
  /** True on any route inside the group; the group then starts (and reopens) expanded. */
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active);
  const id = useId();

  useEffect(() => {
    if (active) {
      setOpen(true);
    }
  }, [active]);

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
        className={`${itemClass} ${
          active
            ? "text-ink hover:bg-ink/5 dark:text-slate-50 dark:hover:bg-white/5"
            : inactiveClass
        }`}
      >
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {label}
        <ChevronDown
          aria-hidden="true"
          className={`ml-auto h-4 w-4 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <ul id={id} hidden={!open} className="mt-1 space-y-1">
        {children}
      </ul>
    </li>
  );
}

interface SidebarProps {
  name: string;
  email: string;
  avatar: AvatarRef | null;
  /** The signed-in user's projects for the Create task dialog, or null when they couldn't be loaded. */
  projects: ProjectOption[] | null;
  /** Teams the user may create projects in, for the Create project dialog. */
  teams: TeamOption[];
  /** The command palette's search button, shown above the menu (desktop sidebar only). */
  search?: ReactNode;
}

/** Dashboard navigation; rendered in the desktop sidebar and inside the mobile drawer. */
export default function Sidebar({ name, email, avatar, projects, teams, search }: SidebarProps) {
  const pathname = usePathname();
  const onBoard = pathname === BOARD_PATH;
  const onMyTasks = pathname === MY_TASKS_PATH;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md font-display text-lg font-bold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
          </span>
          Taskwell
        </Link>
      </div>

      {search && <div className="shrink-0 px-3 pb-2">{search}</div>}

      {/* Scrolls only when the window is too short; the scrollbar is thin and matches the theme. */}
      <nav
        aria-label="Workspace"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-color:rgb(20_33_61/0.25)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgb(255_255_255/0.2)_transparent]"
      >
        <p className={sectionLabelClass}>Menu</p>
        <ul className="mt-2 space-y-1">
          <li>
            <NavLink href="/dashboard" active={pathname === "/dashboard"} icon={LayoutDashboard}>
              Dashboard
            </NavLink>
          </li>
          <NavGroup label="Projects" icon={FolderKanban} active={isActiveNavItem(pathname, PROJECTS_PATH)}>
            <li>
              <NavLink href={PROJECTS_PATH} active={isActiveNavItem(pathname, PROJECTS_PATH)} child>
                All projects
              </NavLink>
            </li>
            <li>
              <CreateProjectButton teams={teams} className={`${childClass} ${inactiveClass}`}>
                Create project
              </CreateProjectButton>
            </li>
          </NavGroup>
          <NavGroup label="Tasks" icon={ListChecks} active={isActiveNavItem(pathname, TASKS_PATH)}>
            <li>
              <NavLink href={TASKS_PATH} active={isActiveNavItem(pathname, TASKS_PATH) && !onBoard && !onMyTasks} child>
                All tasks
              </NavLink>
            </li>
            <li>
              <NavLink href={BOARD_PATH} active={onBoard} child>
                Task board
              </NavLink>
            </li>
            <li>
              <NavLink href={MY_TASKS_PATH} active={onMyTasks} child>
                My tasks
              </NavLink>
            </li>
            <li>
              <CreateTaskButton projects={projects} className={`${childClass} ${inactiveClass}`}>
                Create task
              </CreateTaskButton>
            </li>
          </NavGroup>
          <li>
            <NavLink
              href="/dashboard/templates"
              active={isActiveNavItem(pathname, "/dashboard/templates")}
              icon={LayoutTemplate}
            >
              Templates
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/dashboard/calendar"
              active={isActiveNavItem(pathname, "/dashboard/calendar")}
              icon={CalendarDays}
            >
              Calendar
            </NavLink>
          </li>
          <li>
            <NavLink
              href="/dashboard/reports"
              active={isActiveNavItem(pathname, "/dashboard/reports")}
              icon={ChartColumn}
            >
              Reports
            </NavLink>
          </li>
          <li>
            <NavLink href="/dashboard/teams" active={isActiveNavItem(pathname, "/dashboard/teams")} icon={Users}>
              Teams
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* The divider shows where the scrolling menu ends when the window is short. */}
      <div className="shrink-0 border-t border-ink/10 px-3 pb-4 pt-3 dark:border-white/10">
        <p className={sectionLabelClass}>Others</p>
        <ul className="mt-2 space-y-1">
          <li>
            <NavLink
              href="/dashboard/settings"
              active={isActiveNavItem(pathname, "/dashboard/settings")}
              icon={Settings}
            >
              Settings
            </NavLink>
          </li>
          <li>
            <ThemeToggle variant="switch" className={`${itemClass} ${inactiveClass}`} />
          </li>
        </ul>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink/10 p-3 dark:border-white/10">
          <UserAvatar name={name} email={email} avatar={avatar} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink dark:text-slate-50">{name}</p>
            <p className="truncate text-xs text-muted dark:text-dark-muted">{email}</p>
          </div>
          <LogoutButton
            aria-label="Log out"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50"
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
          </LogoutButton>
        </div>
      </div>
    </div>
  );
}
