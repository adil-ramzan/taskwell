"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ASSIGNABLE_TEAM_ROLES, teamRoleLabels, type AssignableTeamRole } from "@/lib/team-validation";

interface MemberRoleSelectProps {
  teamId: string;
  memberId: string;
  memberName: string;
  role: AssignableTeamRole;
}

/** Role picker for a member the current user is allowed to change; the server re-checks that. */
export default function MemberRoleSelect({ teamId, memberId, memberName, role }: MemberRoleSelectProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function changeRole(nextRole: AssignableTeamRole) {
    if (saving || nextRole === role) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
        setError(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't change this role right now. Please try again.",
        );
      }

      // Success shows the saved role; failure reloads the real state (the select is bound to it).
      router.refresh();
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="relative w-36">
        <select
          aria-label={`Role for ${memberName}`}
          value={role}
          disabled={saving}
          onChange={(event) => changeRole(event.target.value as AssignableTeamRole)}
          className="min-h-10 w-full appearance-none rounded-lg border border-ink/15 bg-paper pl-3 pr-9 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-progress disabled:opacity-70 dark:border-white/15 dark:bg-dark-background dark:text-slate-100"
        >
          {ASSIGNABLE_TEAM_ROLES.map((option) => (
            <option key={option} value={option}>
              {saving && option === role ? "Saving..." : teamRoleLabels[option]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 max-w-[16rem] whitespace-normal text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
