import "server-only";

import type { Prisma } from "@prisma/client";

import { projectAccessWhere } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SEARCH_MAX_TERMS, SEARCH_RESULT_LIMIT } from "@/lib/search-validation";
import type { TaskPriorityValue, TaskStatusValue } from "@/lib/task-validation";
import type { TeamRoleValue } from "@/lib/team-validation";

/*
 * The command palette's search. Three bounded queries, one per kind of record,
 * each with the access rule in its WHERE clause: tasks and projects through
 * lib/access.ts (the owner of a personal project, or a member of a team
 * project's team; never Project.ownerId alone), teams through membership.
 * The user ID always comes from the server-side session.
 *
 * Only what a result row shows is selected. Descriptions are matched but never
 * returned.
 */

export type TaskSearchResult = {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  projectName: string;
};

export type ProjectSearchResult = {
  id: string;
  name: string;
  /** Null for a personal project. */
  teamName: string | null;
};

export type TeamSearchResult = {
  id: string;
  name: string;
  /** The current user's role in the team. */
  role: TeamRoleValue;
  memberCount: number;
};

export type SearchResults = {
  tasks: TaskSearchResult[];
  projects: ProjectSearchResult[];
  teams: TeamSearchResult[];
};

/** Prisma passes `contains` to LIKE as it is, so its wildcards are escaped to match literally. */
const escapeLike = (term: string) => term.replace(/[\\%_]/g, "\\$&");

const contains = (term: string) => ({ contains: escapeLike(term), mode: "insensitive" as const });

/**
 * Finds the user's tasks, projects and teams matching every word of `query`
 * (already validated and normalized). A word may match in any searched field,
 * so "design website" finds the task "Design page" in the project "Website".
 */
export async function searchForUser(userId: string, query: string): Promise<SearchResults> {
  const terms = query.split(" ").slice(0, SEARCH_MAX_TERMS);
  const take = SEARCH_RESULT_LIMIT;

  const taskWhere: Prisma.TaskWhereInput = {
    project: projectAccessWhere(userId),
    AND: terms.map((term) => ({
      OR: [
        { title: contains(term) },
        { description: contains(term) },
        { project: { name: contains(term) } },
        { assignee: { name: contains(term) } },
        // A label's name; the task's labels are always of a workspace this user can see.
        { labels: { some: { label: { name: contains(term) } } } },
      ],
    })),
  };

  const projectWhere: Prisma.ProjectWhereInput = {
    AND: [
      projectAccessWhere(userId),
      ...terms.map((term) => ({
        OR: [{ name: contains(term) }, { description: contains(term) }, { team: { name: contains(term) } }],
      })),
    ],
  };

  const teamWhere: Prisma.TeamWhereInput = {
    memberships: { some: { userId } },
    AND: terms.map((term) => ({ OR: [{ name: contains(term) }, { description: contains(term) }] })),
  };

  // Independent, so they run side by side; each joins what its rows show (no per-row lookups).
  const [tasks, projects, teams] = await Promise.all([
    prisma.task.findMany({
      where: taskWhere,
      select: { id: true, title: true, status: true, priority: true, project: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    }),
    prisma.project.findMany({
      where: projectWhere,
      select: { id: true, name: true, team: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    }),
    prisma.team.findMany({
      where: teamWhere,
      select: {
        id: true,
        name: true,
        // Limited to the current user, for their role.
        memberships: { where: { userId }, select: { role: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take,
    }),
  ]);

  return {
    tasks: tasks.map(({ project, ...task }) => ({ ...task, projectName: project.name })),
    projects: projects.map(({ team, ...project }) => ({ ...project, teamName: team?.name ?? null })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      // The query only returns teams the user is a member of.
      role: team.memberships[0].role,
      memberCount: team._count.memberships,
    })),
  };
}
