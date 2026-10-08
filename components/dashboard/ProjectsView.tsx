"use client";

import { ChevronDown, Pencil, Search, SearchX, Trash2, User, Users } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import Pagination, { useUrlPagination } from "./Pagination";

import { DELETED_USER } from "@/lib/avatars";
import type { ProjectSummary } from "@/lib/projects";
import ConfirmDeleteButton from "./ConfirmDeleteButton";
import CreateProjectButton from "./CreateProjectButton";
import { deleteIconButtonClass, editIconButtonClass } from "./detail-styles";
import EmptyState from "./EmptyState";
import FormattedDate from "./FormattedDate";
import UserAvatar from "./UserAvatar";

/** Projects per page: four rows of the three-column grid. */
export const PROJECTS_PAGE_SIZE = 12;

const sortOptions = {
  updated: "Recently updated",
  created: "Recently created",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
} as const;

type SortKey = keyof typeof sortOptions;

const compareName = (a: ProjectSummary, b: ProjectSummary) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

const comparators: Record<SortKey, (a: ProjectSummary, b: ProjectSummary) => number> = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  "name-asc": compareName,
  "name-desc": (a, b) => compareName(b, a),
};

const controlClass =
  "min-h-11 w-full rounded-lg border border-ink/20 bg-white text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-white/15 dark:bg-dark-surface dark:text-slate-50";

const ALL_SCOPES = "";
const PERSONAL_SCOPE = "personal";

interface ProjectsViewProps {
  projects: ProjectSummary[];
  /** False on a team's own page, where the personal/team filter would be redundant. */
  showScope?: boolean;
}

export default function ProjectsView({ projects, showScope = true }: ProjectsViewProps) {
  const [query, setQuery] = useState("");
  // "" = all, "personal", or a team ID.
  const [scope, setScope] = useState(ALL_SCOPES);
  const teams = useMemo(() => {
    const byId = new Map(projects.flatMap((project) => (project.team ? [[project.team.id, project.team]] : [])));

    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);
  const [sort, setSort] = useState<SortKey>("updated");
  // Filtering is local to the already-loaded projects; no request per keystroke.
  const deferredQuery = useDeferredValue(query);

  const visibleProjects = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    const matches = projects.filter(
      (project) =>
        (scope === ALL_SCOPES ||
          (scope === PERSONAL_SCOPE ? project.team === null : project.team?.id === scope)) &&
        (!term ||
          project.name.toLowerCase().includes(term) ||
          (project.description?.toLowerCase().includes(term) ?? false)),
    );

    return [...matches].sort(comparators[sort]);
  }, [projects, deferredQuery, sort, scope]);
  // Pages are cut from the loaded, filtered and sorted list.
  const paged = useUrlPagination(visibleProjects, PROJECTS_PAGE_SIZE, `${deferredQuery}|${sort}|${scope}`);

  return (
    <section aria-labelledby="project-list-heading" className="space-y-5">
      <h2 id="project-list-heading" className="sr-only">
        Your projects
      </h2>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="project-search" className="sr-only">
            Search projects
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
          />
          <input
            id="project-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects..."
            autoComplete="off"
            className={`${controlClass} pl-9 pr-3 placeholder:text-muted dark:placeholder:text-dark-muted`}
          />
        </div>

        {showScope && teams.length > 0 && (
          <div className="relative sm:w-52">
            <label htmlFor="project-scope" className="sr-only">
              Filter by personal or team
            </label>
            <select
              id="project-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className={`${controlClass} appearance-none pl-3 pr-9`}
            >
              <option value={ALL_SCOPES}>All projects</option>
              <option value={PERSONAL_SCOPE}>Personal</option>
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
        )}

        <div className="relative sm:w-56">
          <label htmlFor="project-sort" className="sr-only">
            Sort projects
          </label>
          <select
            id="project-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className={`${controlClass} appearance-none pl-3 pr-9`}
          >
            {Object.entries(sortOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted dark:text-dark-muted"
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        {visibleProjects.length === 1 ? "1 project" : `${visibleProjects.length} projects`}
      </p>

      {visibleProjects.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <EmptyState icon={SearchX} title="No projects found" description="Try a different search term or filter." />
        </div>
      ) : (
        <ul id="project-list" className="grid scroll-mt-20 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paged.items.map((project) => (
            <li key={project.id} className="min-w-0">
              <article
                aria-labelledby={`project-${project.id}`}
                className="flex h-full flex-col rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dark-surface"
              >
                <p className="mb-2 inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-muted dark:bg-white/5 dark:text-dark-muted">
                  {project.team ? (
                    <>
                      <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span className="sr-only">Team project: </span>
                      <span className="truncate">{project.team.name}</span>
                    </>
                  ) : (
                    <>
                      <User aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      Personal
                    </>
                  )}
                </p>
                <h3
                  id={`project-${project.id}`}
                  className="break-words font-display text-lg font-semibold text-ink dark:text-slate-50"
                >
                  {project.name}
                </h3>
                <p
                  className={`mt-2 line-clamp-3 break-words text-sm ${
                    project.description
                      ? "text-muted dark:text-dark-muted"
                      : "italic text-muted dark:text-dark-muted"
                  }`}
                >
                  {project.description ?? "No description"}
                </p>

                <dl className="mb-5 mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted dark:text-dark-muted">Created</dt>
                    <dd className="mt-0.5 font-medium text-ink dark:text-slate-100">
                      <FormattedDate value={project.createdAt} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted dark:text-dark-muted">Updated</dt>
                    <dd className="mt-0.5 font-medium text-ink dark:text-slate-100">
                      <FormattedDate value={project.updatedAt} />
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto flex items-center gap-2 border-t border-ink/10 pt-4 dark:border-white/10">
                  <UserAvatar
                    name={project.owner?.name ?? DELETED_USER}
                    email={project.owner?.email ?? ""}
                    avatar={project.owner?.avatar}
                    size="sm"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm text-ink dark:text-slate-100">
                    <span className="sr-only">Owner: </span>
                    {project.owner?.name ?? DELETED_USER}
                  </p>
                  {project.canManage && (
                    <>
                      <CreateProjectButton project={project} className={editIconButtonClass}>
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Edit {project.name}</span>
                      </CreateProjectButton>
                      <ConfirmDeleteButton
                        className={deleteIconButtonClass}
                        title="Delete project"
                        noun="project"
                        endpoint={`/api/projects/${project.id}`}
                        description={
                          <>
                            <p>
                              Delete{" "}
                              <strong className="font-semibold text-ink dark:text-slate-50">{project.name}</strong>?
                            </p>
                            <p>
                              Deleting this project also permanently deletes all of its tasks. This can&apos;t be
                              undone.
                            </p>
                          </>
                        }
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Delete {project.name}</span>
                      </ConfirmDeleteButton>
                    </>
                  )}
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    aria-label={`Open ${project.name}`}
                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-ink/15 px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:text-slate-100"
                  >
                    Open
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Pagination {...paged} noun="projects" onChange={paged.setPage} scrollToId="project-list" />
    </section>
  );
}
