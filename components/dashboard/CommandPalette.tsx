"use client";

import {
  CirclePlus,
  CornerDownLeft,
  FolderKanban,
  FolderPlus,
  History,
  ListChecks,
  Search,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { paletteNavItems } from "@/lib/navigation";
import type { SearchResults } from "@/lib/search";
import {
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  normalizeSearchQuery,
} from "@/lib/search-validation";
import { taskPriorityLabels, taskStatusLabels } from "@/lib/task-validation";
import { teamRoleLabels } from "@/lib/team-validation";
import CreateProjectButton, { type TeamOption } from "./CreateProjectButton";
import CreateTaskButton, { type CreateDialogHandle, type ProjectOption } from "./CreateTaskButton";

/*
 * The dashboard's command palette: one modal dialog, opened with Ctrl/Cmd+K or
 * a CommandPaletteButton. It lists navigation commands and quick actions, and
 * searches the user's tasks, projects and teams through /api/search.
 *
 * Everything the palette can do is a PaletteItem whose `action` is plain data.
 * The server only ever sends records (IDs and text); what selecting one does is
 * decided here, from its kind.
 */

type PaletteAction = { type: "navigate"; href: string } | { type: "create-task" } | { type: "create-project" };

type PaletteGroup = "recent" | "navigation" | "actions" | "tasks" | "projects" | "teams";

type RecentKind = "task" | "project" | "team";

/** Kept in localStorage: just enough to show the row and rebuild its link. */
type RecentItem = { kind: RecentKind; id: string; label: string };

type PaletteItem = {
  /** Unique within the list. */
  id: string;
  group: PaletteGroup;
  label: string;
  description?: string;
  icon: LucideIcon;
  action: PaletteAction;
  /** Set on records, so opening one is remembered under Recent. */
  recent?: RecentItem;
};

const groupLabels: Record<PaletteGroup, string> = {
  recent: "Recent",
  navigation: "Navigation",
  actions: "Actions",
  tasks: "Tasks",
  projects: "Projects",
  teams: "Teams",
};

const GROUP_ORDER: PaletteGroup[] = ["recent", "navigation", "actions", "tasks", "projects", "teams"];

const recentIcons: Record<RecentKind, LucideIcon> = { task: ListChecks, project: FolderKanban, team: Users };
const recentKindLabels: Record<RecentKind, string> = { task: "Task", project: "Project", team: "Team" };

// Built here from the record's kind and ID; a stored or returned URL is never followed.
const recordHref = (kind: RecentKind, id: string) => `/dashboard/${kind}s/${encodeURIComponent(id)}`;

const actionItems: (PaletteItem & { keywords: string })[] = [
  {
    id: "action:create-task",
    group: "actions",
    label: "Create Task",
    icon: CirclePlus,
    action: { type: "create-task" },
    keywords: "new add",
  },
  {
    id: "action:create-project",
    group: "actions",
    label: "Create Project",
    icon: FolderPlus,
    action: { type: "create-project" },
    keywords: "new add",
  },
];

const navigationItems = paletteNavItems.map((item) => ({
  id: `nav:${item.href}`,
  group: "navigation" as const,
  label: item.label,
  icon: item.icon,
  action: { type: "navigate" as const, href: item.href },
  keywords: item.keywords,
}));

const commandItems = [...navigationItems, ...actionItems];

/*
 * Recent: the last few records opened from the palette, per account, in this
 * browser only. Holds a kind, an ID and the name shown; no descriptions and
 * nothing about the account. Opening an entry goes through the normal page, so
 * one that has been deleted or is no longer accessible simply isn't found.
 */
const RECENT_LIMIT = 5;
const RECENT_LABEL_MAX_LENGTH = 200;
const recentKey = (userId: string) => `taskwell-recent:${userId}`;

const isRecentItem = (value: unknown): value is RecentItem => {
  const item = value as Partial<RecentItem> | null;

  return (
    typeof item === "object" &&
    item !== null &&
    (item.kind === "task" || item.kind === "project" || item.kind === "team") &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 100 &&
    typeof item.label === "string"
  );
};

function readRecent(userId: string): RecentItem[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentKey(userId)) ?? "[]");

    return Array.isArray(stored) ? stored.filter(isRecentItem).slice(0, RECENT_LIMIT) : [];
  } catch {
    // Storage is blocked or holds something else: no recent items.
    return [];
  }
}

function rememberRecent(userId: string, item: RecentItem) {
  try {
    const next = [
      { kind: item.kind, id: item.id, label: item.label.slice(0, RECENT_LABEL_MAX_LENGTH) },
      ...readRecent(userId).filter((other) => other.kind !== item.kind || other.id !== item.id),
    ].slice(0, RECENT_LIMIT);

    localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    // A convenience only; ignored when storage is unavailable.
  }
}

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: SearchResults }
  | { status: "error"; kind: SearchProblem };

type SearchProblem = "unavailable" | "session" | "offline" | "failed";

const problemMessages: Record<SearchProblem, string> = {
  unavailable: "Search is temporarily unavailable. Please try again in a moment.",
  session: "Your session has ended. Sign in again to search.",
  offline: "Unable to reach the server. Check your connection and try again.",
  failed: "We couldn't search right now. Please try again.",
};

// Long enough to skip the requests of someone still typing, short enough not to feel slow.
const DEBOUNCE_MS = 200;

const isSearchResults = (value: unknown): value is SearchResults => {
  const results = value as Partial<SearchResults> | null;

  return (
    typeof results === "object" &&
    results !== null &&
    Array.isArray(results.tasks) &&
    Array.isArray(results.projects) &&
    Array.isArray(results.teams)
  );
};

function resultItems(results: SearchResults): PaletteItem[] {
  return [
    ...results.tasks.map((task): PaletteItem => ({
      id: `task:${task.id}`,
      group: "tasks",
      label: task.title,
      description: `${task.projectName} · ${taskStatusLabels[task.status]} · ${taskPriorityLabels[task.priority]} priority`,
      icon: ListChecks,
      action: { type: "navigate", href: recordHref("task", task.id) },
      recent: { kind: "task", id: task.id, label: task.title },
    })),
    ...results.projects.map((project): PaletteItem => ({
      id: `project:${project.id}`,
      group: "projects",
      label: project.name,
      description: project.teamName ? `Team project · ${project.teamName}` : "Personal project",
      icon: FolderKanban,
      action: { type: "navigate", href: recordHref("project", project.id) },
      recent: { kind: "project", id: project.id, label: project.name },
    })),
    ...results.teams.map((team): PaletteItem => ({
      id: `team:${team.id}`,
      group: "teams",
      label: team.name,
      description: `${teamRoleLabels[team.role]} · ${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`,
      icon: Users,
      action: { type: "navigate", href: recordHref("team", team.id) },
      recent: { kind: "team", id: team.id, label: team.name },
    })),
  ];
}

type CommandPaletteState = { open: () => void; shortcut: string };

const CommandPaletteContext = createContext<CommandPaletteState>({ open: () => {}, shortcut: "Ctrl K" });

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50";
const kbdClass =
  "rounded border border-ink/15 bg-white px-1.5 py-0.5 font-body text-[11px] font-medium text-muted dark:border-white/15 dark:bg-dark-surface dark:text-dark-muted";

/** Opens the palette. "bar" is the sidebar's search field look; "icon" fits the mobile top bar. */
export function CommandPaletteButton({ variant }: { variant: "bar" | "icon" }) {
  const { open, shortcut } = useContext(CommandPaletteContext);

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search and commands"
        aria-haspopup="dialog"
        className={iconButtonClass}
      >
        <Search aria-hidden="true" className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search and commands"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-ink/15 bg-paper px-3 text-left text-sm text-muted hover:border-brand hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-white/15 dark:bg-dark-background dark:text-dark-muted dark:hover:text-slate-50"
    >
      <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
      Search
      <kbd aria-hidden="true" className={`ml-auto ${kbdClass}`}>
        {shortcut}
      </kbd>
    </button>
  );
}

interface CommandPaletteProviderProps {
  /** The signed-in user's ID, from the server; only names this browser's Recent list. */
  userId: string;
  /** For the Create task dialog, as in the sidebar; null when they couldn't be loaded. */
  projects: ProjectOption[] | null;
  /** Teams the user may create projects in, as in the sidebar. */
  teams: TeamOption[];
  children: ReactNode;
}

/**
 * Renders the palette once for the whole dashboard and listens for Ctrl/Cmd+K.
 * It is mounted by the dashboard layout only, so the shortcut is untouched
 * everywhere else on the site.
 */
export function CommandPaletteProvider({ userId, projects, teams, children }: CommandPaletteProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The existing create dialogs, opened through their own handles.
  const createTaskRef = useRef<CreateDialogHandle>(null);
  const createProjectRef = useRef<CreateDialogHandle>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [isMac, setIsMac] = useState(false);
  const query = normalizeSearchQuery(input);
  const searchable = query.length >= SEARCH_QUERY_MIN_LENGTH;

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const openPalette = useCallback(() => {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) {
      return;
    }

    setInput("");
    setActiveIndex(0);
    setSearch({ status: "idle" });
    setRecent(readRecent(userId));
    // showModal() traps focus, makes the page behind inert and, on close, returns focus to where it was.
    dialog.showModal();
    inputRef.current?.focus();
    setOpen(true);
  }, [userId]);

  const closePalette = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();

      const dialog = dialogRef.current;

      if (dialog?.open) {
        dialog.close();
        return;
      }

      // Another dialog or the mobile drawer is in use: don't stack the palette on top of it.
      if (!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        openPalette();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPalette]);

  // Close after any route change (a result was opened, or back/forward).
  useEffect(() => {
    closePalette();
  }, [pathname, closePalette]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  /*
   * One request per settled query. Each run of this effect owns its request:
   * changing the query (or closing) cancels the timer and aborts the request,
   * and an aborted run never touches state, so an older, slower response can't
   * replace the results of a newer query.
   */
  useEffect(() => {
    if (!open || !searchable) {
      setSearch({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const settle = (state: SearchState) => {
      if (!controller.signal.aborted) {
        setSearch(state);
      }
    };

    setSearch({ status: "loading" });

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          // A failure is never shown as "no results".
          settle({
            status: "error",
            kind: response.status === 503 ? "unavailable" : response.status === 401 ? "session" : "failed",
          });
          return;
        }

        const payload = (await response.json().catch(() => null)) as { results?: unknown } | null;

        settle(
          isSearchResults(payload?.results)
            ? { status: "ready", results: payload.results }
            : { status: "error", kind: "failed" },
        );
      } catch {
        settle({ status: "error", kind: "offline" });
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, searchable, query]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!query) {
      return [
        ...recent.map((item): PaletteItem => ({
          id: `recent:${item.kind}:${item.id}`,
          group: "recent",
          label: item.label,
          description: recentKindLabels[item.kind],
          icon: recentIcons[item.kind],
          action: { type: "navigate", href: recordHref(item.kind, item.id) },
          recent: item,
        })),
        ...commandItems,
      ];
    }

    const lowered = query.toLowerCase();
    const terms = lowered.split(" ");
    // A label that starts with what was typed comes first, so "board" offers Board before Dashboard.
    const rank = (label: string) => (label.toLowerCase().startsWith(lowered) ? 0 : 1);
    const commands = commandItems
      .filter((item) => {
        const text = `${item.label} ${item.keywords}`.toLowerCase();

        return terms.every((term) => text.includes(term));
      })
      .sort((a, b) => rank(a.label) - rank(b.label));

    return search.status === "ready" ? [...commands, ...resultItems(search.results)] : commands;
  }, [query, recent, search]);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        // Each row keeps its position in the flat list, which is what the arrow keys walk.
        rows: items.flatMap((item, index) => (item.group === group ? [{ item, index }] : [])),
      })).filter(({ rows }) => rows.length > 0),
    [items],
  );

  // The list changed under the highlight: start again from the top.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, search.status]);

  const active = Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    if (open) {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active]);

  function run(item: PaletteItem) {
    // Closing first hands focus back to where it was, so a create dialog returns it there too.
    closePalette();

    if (item.action.type === "create-task") {
      createTaskRef.current?.open();
      return;
    }

    if (item.action.type === "create-project") {
      createProjectRef.current?.open();
      return;
    }

    if (item.recent) {
      rememberRecent(userId, item.recent);
    }

    // Already there: nothing to load.
    if (item.action.href !== pathname) {
      router.push(item.action.href);
      // Like the mobile drawer: focus follows the user to the page they asked for.
      document.getElementById("main-content")?.focus();
    }
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // Enter and the arrows belong to an input method while it is composing.
    if (event.nativeEvent.isComposing || items.length === 0) {
      return;
    }

    const last = items.length - 1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(active >= last ? 0 : active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(active <= 0 ? last : active - 1);
    } else if (event.key === "Home" && input === "") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && input === "") {
      event.preventDefault();
      setActiveIndex(last);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(items[active]);
    }
  }

  const problem = search.status === "error" ? problemMessages[search.kind] : "";
  const noResults =
    search.status === "ready" &&
    search.results.tasks.length + search.results.projects.length + search.results.teams.length === 0;
  const countText = `${items.length} ${items.length === 1 ? "result" : "results"} available.`;
  // Read out by screen readers as the list changes.
  const announcement = !open
    ? ""
    : search.status === "loading"
      ? "Searching."
      : problem
        ? `${problem} ${countText}`
        : noResults
          ? `No tasks, projects or teams match. ${countText}`
          : countText;
  const optionId = (index: number) => `${id}-option-${index}`;
  const shortcut = isMac ? "⌘K" : "Ctrl K";
  const context = useMemo(() => ({ open: openPalette, shortcut }), [openPalette, shortcut]);

  return (
    <CommandPaletteContext.Provider value={context}>
      {children}

      <dialog
        ref={dialogRef}
        aria-label="Command palette"
        // The close event arrives a moment after close(); the palette may have been reopened by then.
        onClose={() => setOpen(dialogRef.current?.open ?? false)}
        onClick={(event) => {
          // Clicks on the backdrop target the dialog element itself.
          if (event.target === event.currentTarget) {
            closePalette();
          }
        }}
        className="mx-auto mb-auto mt-4 w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-white p-0 text-left text-base font-normal text-ink shadow-xl backdrop:bg-ink/50 dark:border-white/10 dark:bg-dark-surface dark:text-slate-50 dark:backdrop:bg-black/60 sm:mt-[12vh]"
      >
        <div className="flex max-h-[min(34rem,calc(100dvh-2rem))] flex-col sm:max-h-[min(34rem,76dvh)]">
          <div className="flex shrink-0 items-center gap-2 border-b border-ink/10 py-1.5 pl-4 pr-1.5 focus-within:border-brand dark:border-white/10 dark:focus-within:border-brand">
            <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted dark:text-dark-muted" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Search tasks, projects, teams and commands"
              aria-expanded={items.length > 0}
              aria-controls={`${id}-list`}
              aria-activedescendant={items.length > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              aria-describedby={`${id}-status`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              maxLength={SEARCH_QUERY_MAX_LENGTH}
              placeholder="Search or jump to..."
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none dark:text-slate-50 dark:placeholder:text-dark-muted"
            />
            <button type="button" onClick={closePalette} aria-label="Close command palette" className={iconButtonClass}>
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
            <div id={`${id}-list`} role="listbox" aria-label="Results">
              {groups.map(({ group, rows }) => (
              <div key={group} role="group" aria-labelledby={`${id}-group-${group}`} className="pb-1">
                <p
                  id={`${id}-group-${group}`}
                  className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted dark:text-dark-muted"
                >
                  {groupLabels[group]}
                </p>
                {rows.map(({ item, index }) => {
                  const selected = index === active;
                  const Icon = group === "recent" ? History : item.icon;

                  return (
                    <div
                      key={item.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      // Moving the pointer highlights; a list scrolling under a still pointer doesn't.
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => run(item)}
                      className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${
                        selected ? "bg-brand/10 dark:bg-white/10" : ""
                      }`}
                    >
                      {/* The bar and the Enter mark show the highlighted row without relying on colour. */}
                      {selected && (
                        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" />
                      )}
                      <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted dark:text-dark-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink dark:text-slate-50">
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="block truncate text-xs text-muted dark:text-dark-muted">
                            {item.description}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <CornerDownLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-ink dark:text-slate-50" />
                      )}
                    </div>
                  );
                })}
              </div>
              ))}
            </div>

            {/* Messages scroll with the list but are not options. */}
            <div className="text-sm text-muted dark:text-dark-muted">
              {search.status === "loading" && <p className="px-3 py-3">Searching...</p>}

              {search.status === "error" && (
                <div
                  role="alert"
                  className="m-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  <p>{problem}</p>
                  {search.kind === "session" && (
                    // A full page load, so the sign-in page starts from the server's view of the session.
                    <a
                      href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                      className="mt-1 inline-flex min-h-9 items-center rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      Sign in
                    </a>
                  )}
                </div>
              )}

              {noResults && (
                <p className="px-3 py-3">
                  No tasks, projects or teams match <span className="font-medium text-ink dark:text-slate-50">&ldquo;{query}&rdquo;</span>.
                </p>
              )}

              {query !== "" && !searchable && (
                <p className="px-3 py-3">
                  {items.length === 0 ? "No matching commands. " : ""}
                  Type at least {SEARCH_QUERY_MIN_LENGTH} characters to search tasks, projects and teams.
                </p>
              )}
            </div>
          </div>

          <div id={`${id}-status`} role="status" aria-live="polite" className="sr-only">
            {announcement}
          </div>

          <div
            aria-hidden="true"
            className="hidden shrink-0 items-center gap-4 border-t border-ink/10 px-4 py-2 text-xs text-muted dark:border-white/10 dark:text-dark-muted sm:flex"
          >
            <span className="inline-flex items-center gap-1.5">
              <kbd className={kbdClass}>↑</kbd>
              <kbd className={kbdClass}>↓</kbd>
              Navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className={kbdClass}>Enter</kbd>
              Select
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className={kbdClass}>Esc</kbd>
              Close
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <kbd className={kbdClass}>{shortcut}</kbd>
              Toggle
            </span>
          </div>
        </div>
      </dialog>

      {/* The same dialogs the sidebar opens. Their triggers stay hidden; the palette opens them by handle. */}
      <CreateTaskButton ref={createTaskRef} projects={projects} className="hidden">
        Create task
      </CreateTaskButton>
      <CreateProjectButton ref={createProjectRef} teams={teams} className="hidden">
        Create project
      </CreateProjectButton>
    </CommandPaletteContext.Provider>
  );
}
