"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";

interface AnalyticsScopeSelectProps {
  /** "all", "personal" or a team ID, as the server resolved it. */
  value: string;
  /** The teams the signed-in user belongs to. */
  teams: { id: string; name: string }[];
}

/**
 * Chooses which of the user's own work the dashboard counts. It only changes
 * the URL; the server checks the choice against the user's memberships.
 */
export default function AnalyticsScopeSelect({ value, teams }: AnalyticsScopeSelectProps) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();

  return (
    <div className="min-w-0 sm:w-56">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted dark:text-dark-muted">
        Showing
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-busy={pending}
          onChange={(event) => {
            const scope = event.target.value;

            startTransition(() => {
              router.push(scope === "all" ? "/dashboard" : `/dashboard?scope=${encodeURIComponent(scope)}`);
            });
          }}
          className={`min-h-11 w-full appearance-none truncate rounded-lg border border-ink/20 bg-white pl-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50 ${
            pending ? "opacity-70" : ""
          }`}
        >
          <option value="all">All my work</option>
          <option value="personal">Personal projects</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              Team: {team.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
        />
      </div>
    </div>
  );
}
