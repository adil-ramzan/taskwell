"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AssignableMember } from "@/lib/teams";

/** teamId -> members the current user may assign tasks to (teams where they are owner or admin). */
type AssignableMembersByTeam = Record<string, AssignableMember[]>;

const AssignmentContext = createContext<AssignableMembersByTeam>({});

/**
 * Provided once by the dashboard layout so every task dialog and assignee
 * control can offer the right people without each page loading them again.
 * It only decides what the UI offers; the server re-checks every assignment.
 */
export function AssignmentProvider({ value, children }: { value: AssignableMembersByTeam; children: ReactNode }) {
  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

/** Undefined when the task's project is personal or the user can't assign in its team. */
export function useAssignableMembers(teamId: string | null | undefined) {
  const byTeam = useContext(AssignmentContext);

  return teamId ? byTeam[teamId] : undefined;
}
