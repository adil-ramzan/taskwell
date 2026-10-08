import Link from "next/link";

import type { ProjectStat } from "@/lib/analytics";

interface ProjectStatsProps {
  /** The projects with the most tasks; null when the data couldn't be loaded. */
  projects: ProjectStat[] | null;
  /** All projects in the current scope, of which `projects` may be only the first few. */
  projectCount: number;
}

const linkClass =
  "rounded font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-slate-50";

/** Tasks and completion per project. A project without tasks says so instead of showing 0%. */
export default function ProjectStats({ projects, projectCount }: ProjectStatsProps) {
  return (
    <section
      aria-labelledby="project-stats-heading"
      className="min-w-0 rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="project-stats-heading" className="font-display text-lg font-semibold text-ink dark:text-slate-50">
            Project progress
          </h2>
          <p className="mt-1 text-sm text-muted dark:text-dark-muted">
            {projects === null
              ? "Project data is unavailable right now."
              : projectCount === 0
                ? "No projects here yet. Create one to start tracking its tasks."
                : projectCount > projects.length
                  ? `The ${projects.length} projects with the most tasks, of ${projectCount}.`
                  : "Tasks and completion for each project."}
          </p>
        </div>
        {projects !== null && projectCount > 0 && (
          <Link href="/dashboard/projects" className={`${linkClass} inline-flex min-h-6 items-center text-sm`}>
            View all projects
          </Link>
        )}
      </div>

      {projects !== null && projects.length > 0 && (
        <ul className="mt-5 space-y-4">
          {projects.map((project) => {
            const share = project.total > 0 ? Math.round((project.completed / project.total) * 100) : null;

            return (
              <li key={project.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    <Link href={`/dashboard/projects/${project.id}`} className={linkClass}>
                      {project.name}
                    </Link>{" "}
                    <span className="text-xs text-muted dark:text-dark-muted">· {project.team ?? "Personal"}</span>
                  </span>
                  <span className="shrink-0 text-muted dark:text-dark-muted">
                    {share === null ? (
                      "No tasks"
                    ) : (
                      <>
                        <span className="font-medium text-ink dark:text-slate-100">
                          {project.completed} of {project.total}
                        </span>{" "}
                        completed · {share}%
                      </>
                    )}
                  </span>
                </div>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
                  {share !== null && <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
