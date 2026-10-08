import type { TaskSummary } from "@/lib/tasks";
import type { TeamMembersByTeam } from "@/lib/teams";

export type AssigneeOption = { id: string; name: string };

/**
 * The people offered by an assignee filter: every member of the teams whose
 * projects are in scope (so a member with no tasks is still listed), plus
 * anyone who is the assignee of a task in scope. Personal projects have no
 * team, so they add nobody. This only builds a filter over tasks the server
 * already authorized; it grants no access.
 */
export function assigneeOptions(
  tasks: TaskSummary[],
  teamIds: Iterable<string | null>,
  teamMembers: TeamMembersByTeam,
): AssigneeOption[] {
  const byId = new Map<string, AssigneeOption>();

  for (const teamId of new Set(teamIds)) {
    for (const member of (teamId && teamMembers[teamId]) || []) {
      byId.set(member.id, member);
    }
  }

  for (const task of tasks) {
    if (task.assignee && !byId.has(task.assignee.id)) {
      byId.set(task.assignee.id, { id: task.assignee.id, name: task.assignee.name });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
