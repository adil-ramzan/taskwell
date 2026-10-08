"use client";

import { Bell, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { NotificationPage, NotificationSummary } from "@/lib/notifications";
import { DueDateText } from "./DueDate";
import RelativeTime from "./RelativeTime";

// How often the server is asked whether anything is new, while the tab is visible.
const POLL_MS = 10_000;
// Navigation, returning to the tab and coming back online also check; no two checks are closer than this.
const MIN_GAP_MS = 3_000;
// After a failed check the wait doubles, up to this, and returns to POLL_MS on the first success.
const MAX_BACKOFF_MS = 60_000;

type NotificationsState = {
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
  /** Goes up each time the server reports a change (a new notification, or a different unread count). */
  revision: number;
};

const NotificationsContext = createContext<NotificationsState>({ unreadCount: 0, setUnreadCount: () => {}, revision: 0 });

/**
 * Keeps every bell on the page (the mobile bar and the desktop sidebar each
 * render one) up to date without a reload. The first count comes from the
 * server with the page. After that the provider asks
 * `/api/notifications/unread-count` every 10 seconds while the tab is visible,
 * and at once when the tab becomes visible again, the browser comes back
 * online, or the user navigates. Nothing is requested while the tab is hidden.
 *
 * A failed request (offline, a 503, a timeout) changes nothing on screen: the
 * last known count stays, the next try waits longer each time (10 s, 20 s,
 * 40 s, 60 s), and the first success returns to the normal pace. Answers that
 * arrive out of order are ignored, and a 401 (signed out) stops the checks.
 */
export function NotificationsProvider({ initialCount, children }: { initialCount: number; children: ReactNode }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const [revision, setRevision] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const lastFetch = useRef(Date.now());
  // What the server last reported, to tell a change from a repeat.
  const pulse = useRef<{ count: number; latestId: string | null | undefined }>({ count: initialCount, latestId: undefined });
  const failures = useRef(0);
  const sequence = useRef(0);
  const stopped = useRef(false);
  const timer = useRef<number>();

  // router.refresh() re-renders the layout with a fresh count.
  useEffect(() => {
    setUnreadCount(initialCount);
    lastFetch.current = Date.now();

    if (pulse.current.count !== initialCount) {
      pulse.current = { ...pulse.current, count: initialCount };
      setRevision((current) => current + 1);
    }
  }, [initialCount]);

  const check = useCallback(async (force = false) => {
    if (stopped.current || document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return;

    lastFetch.current = Date.now();

    const mine = ++sequence.current;
    let ok = false;

    try {
      const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { count?: unknown; latestId?: unknown } | null;

      if (response.status === 401) {
        stopped.current = true;
        return;
      }

      // A newer check has been sent since; its answer is the one that counts.
      if (mine !== sequence.current) return;

      if (response.ok && typeof payload?.count === "number") {
        const latestId = typeof payload.latestId === "string" ? payload.latestId : null;
        const before = pulse.current;

        ok = true;
        pulse.current = { count: payload.count, latestId };
        setUnreadCount(payload.count);

        if (before.count !== payload.count || (before.latestId !== undefined && before.latestId !== latestId)) {
          setRevision((current) => current + 1);
        }

        // Something new arrived: more unread than before, or a different newest notification.
        const arrived = payload.count > before.count || (before.latestId !== undefined && latestId !== null && before.latestId !== latestId);

        if (arrived && payload.count > 0) {
          setAnnouncement(`New notification. ${payload.count} unread.`);
        }
      }
    } catch {
      // Offline or the server is down: keep the last known count and try again later.
    } finally {
      if (mine === sequence.current) failures.current = ok ? 0 : failures.current + 1;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // A chain of timeouts rather than an interval, so the wait can grow after failures.
    const schedule = () => {
      const wait = Math.min(POLL_MS * 2 ** Math.min(failures.current, 6), MAX_BACKOFF_MS);

      timer.current = window.setTimeout(async () => {
        await check(true);
        if (!cancelled) schedule();
      }, wait);
    };
    // Returning to the tab or to the network checks right away and restarts the wait from there.
    const wake = async () => {
      if (document.visibilityState !== "visible") return;

      window.clearTimeout(timer.current);
      await check();
      if (!cancelled) schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [check]);

  useEffect(() => {
    void check();
  }, [pathname, check]);

  const value = useMemo(() => ({ unreadCount, setUnreadCount, revision }), [unreadCount, revision]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {/* Tells screen-reader users about a notification that arrives while they are on the page. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </NotificationsContext.Provider>
  );
}

const strongClass = "font-semibold text-ink dark:text-slate-50";

function NotificationText({ notification }: { notification: NotificationSummary }) {
  const who = <span className={strongClass}>{notification.actor ?? "A deleted user"}</span>;
  const subject = <span className={strongClass}>{notification.subject}</span>;

  switch (notification.type) {
    case "TASK_ASSIGNED":
      return <>{who} assigned you {subject}</>;
    case "COMMENT_MENTION":
      return <>{who} mentioned you in {subject}</>;
    case "COMMENT_ADDED":
      return <>{who} commented on {subject}</>;
    case "TEAM_INVITATION":
      return <>{who} invited you to join {subject}</>;
    case "TASK_REMINDER":
      // Nobody caused a reminder, so nobody is named. The due date is the task's current one, in the reader's zone.
      return notification.dueDate ? (
        <>
          Reminder: {subject} is due <DueDateText value={notification.dueDate} />
        </>
      ) : (
        <>Reminder: {subject}</>
      );
  }
}

const GENERIC_ERROR = "We couldn't load your notifications right now. Please try again.";

async function fetchPage(cursor?: string): Promise<NotificationPage> {
  const response = await fetch(`/api/notifications${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as Partial<NotificationPage> | null;

  if (!response.ok || !payload || !Array.isArray(payload.notifications)) {
    throw new Error(GENERIC_ERROR);
  }

  return {
    notifications: payload.notifications,
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
    unreadCount: typeof payload.unreadCount === "number" ? payload.unreadCount : 0,
  };
}

const textButtonClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-brand-dark hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-white/10";

/** The bell, its unread badge and the notification panel. */
export default function NotificationBell() {
  const pathname = usePathname();
  const id = useId();
  const { unreadCount, setUnreadCount, revision } = useContext(NotificationsContext);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Whether older pages have been added below the first one.
  const olderLoaded = useRef(false);
  const seenRevision = useRef(revision);

  const load = useCallback(
    async (before?: string) => {
      setError("");
      setLoading(true);

      try {
        const page = await fetchPage(before);

        // A notification never appears twice, whichever page it arrives with.
        setItems((current) => {
          if (!before || !current) return page.notifications;

          const known = new Set(current.map((item) => item.id));

          return [...current, ...page.notifications.filter((item) => !known.has(item.id))];
        });
        olderLoaded.current = Boolean(before);
        setCursor(page.nextCursor);
        setUnreadCount(page.unreadCount);
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        setLoading(false);
      }
    },
    [setUnreadCount],
  );

  /**
   * Brings an open panel up to date after the server reported a change: the
   * newest page is fetched again and laid over what is shown. Nothing flickers
   * (no "Loading...", the scroll position stays), older pages already loaded
   * stay below it, and a failure leaves the list as it is for the next change.
   */
  const refreshQuietly = useCallback(async () => {
    try {
      const page = await fetchPage();
      const fresh = new Set(page.notifications.map((item) => item.id));

      setItems((current) =>
        current && olderLoaded.current
          ? [...page.notifications, ...current.filter((item) => !fresh.has(item.id))]
          : page.notifications,
      );
      if (!olderLoaded.current) setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setError("");
    } catch {
      // The next change, or reopening the panel, tries again.
    }
  }, [setUnreadCount]);

  useEffect(() => {
    if (seenRevision.current === revision) return;

    seenRevision.current = revision;
    if (open) void refreshQuietly();
  }, [revision, open, refreshQuietly]);

  // Close after any route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Always the latest when opened.
    load();
    panelRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, load]);

  function markRead(notification: NotificationSummary) {
    if (notification.read) {
      return;
    }

    setItems((current) => current?.map((item) => (item.id === notification.id ? { ...item, read: true } : item)) ?? null);
    setUnreadCount((count) => Math.max(0, count - 1));
    // keepalive lets the request finish when the click also navigates away.
    fetch(`/api/notifications/${encodeURIComponent(notification.id)}/read`, { method: "PATCH", keepalive: true }).catch(
      () => {},
    );
  }

  async function markAllRead() {
    setError("");

    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });

      if (!response.ok) {
        throw new Error();
      }

      setItems((current) => current?.map((item) => ({ ...item, read: true })) ?? null);
      setUnreadCount(0);
    } catch {
      setError("We couldn't mark your notifications as read. Please try again.");
    }
  }

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:bg-white/5 dark:hover:text-slate-50 lg:h-10 lg:w-10"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-dark-surface"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${id}-panel`}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className="fixed inset-x-2 top-[3.75rem] z-40 flex max-h-[min(32rem,calc(100dvh-4.5rem))] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl focus:outline-none dark:border-white/10 dark:bg-dark-surface lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-2 lg:w-96"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink/10 px-4 py-2.5 dark:border-white/10">
            <h2 className="font-display text-base font-semibold text-ink dark:text-slate-50">Notifications</h2>
            <button type="button" onClick={markAllRead} disabled={unreadCount === 0} className={textButtonClass}>
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
              Mark all as read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {error && (
              <p role="alert" className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}

            {items === null ? (
              !error && <p className="px-4 py-8 text-center text-sm text-muted dark:text-dark-muted">Loading...</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell aria-hidden="true" className="mx-auto h-6 w-6 text-muted/70 dark:text-dark-muted/70" />
                <p className="mt-2 text-sm font-medium text-ink dark:text-slate-50">No notifications yet</p>
                <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                  Assignments, comments, mentions, team invitations and reminders will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink/10 dark:divide-white/10">
                {items.map((notification) => (
                  <li
                    key={notification.id}
                    className={`flex items-start gap-1 ${notification.read ? "" : "bg-brand/5 dark:bg-brand/10"}`}
                  >
                    <Link
                      href={notification.href}
                      onClick={() => {
                        markRead(notification);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 pr-1 hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand dark:hover:bg-white/5"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          notification.read ? "border border-ink/25 dark:border-white/25" : "bg-brand"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block break-words text-sm [overflow-wrap:anywhere] ${
                            notification.read ? "text-muted dark:text-dark-muted" : "text-ink dark:text-slate-100"
                          }`}
                        >
                          <span className="sr-only">{notification.read ? "Read: " : "Unread: "}</span>
                          <NotificationText notification={notification} />
                        </span>
                        <span className="mt-0.5 block text-xs text-muted dark:text-dark-muted">
                          <RelativeTime value={notification.createdAt} />
                        </span>
                      </span>
                    </Link>
                    {notification.read ? (
                      <span className="w-11 shrink-0" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => markRead(notification)}
                        title="Mark as read"
                        className="mr-1 mt-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:bg-white/10 dark:hover:text-slate-50"
                      >
                        <Check aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">Mark as read</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {items !== null && cursor && (
              <div className="border-t border-ink/10 p-2 text-center dark:border-white/10">
                <button type="button" onClick={() => load(cursor)} disabled={loading} className={textButtonClass}>
                  {loading ? "Loading..." : "Load older notifications"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
