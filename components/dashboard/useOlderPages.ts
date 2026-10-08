"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = { id: string; createdAt: string };
type Page<T> = { items: T[]; nextCursor: string | null };

const byAge = (a: Item, b: Item) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * "Load older" state for a list whose latest page comes from the server as a
 * prop. Older pages are fetched one at a time with the server's cursor and kept
 * here; the latest page keeps coming from the prop, so router.refresh() still
 * updates it. Items that slide out of the latest page when new ones arrive are
 * kept too, so the loaded list never has a gap.
 *
 * Returns the loaded items oldest first.
 */
export function useOlderPages<T extends Item>(
  latest: T[],
  initialCursor: string | null,
  loadPage: (cursor: string) => Promise<Page<T>>,
) {
  const [older, setOlder] = useState<T[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef(latest);
  const removed = useRef(new Set<string>());

  useEffect(() => {
    const ids = new Set(latest.map((item) => item.id));
    const oldest = [...latest].sort(byAge)[0];
    // Still exists, just no longer among the latest: it is older than everything in the new page.
    const slidOut = previous.current.filter(
      (item) => !ids.has(item.id) && !removed.current.has(item.id) && oldest && byAge(item, oldest) < 0,
    );

    previous.current = latest;

    if (slidOut.length > 0) {
      setOlder((current) => [...current, ...slidOut]);
    }
  }, [latest]);

  const items = useMemo(() => {
    const byId = new Map<string, T>();

    for (const item of [...older, ...latest]) {
      byId.set(item.id, item);
    }

    return [...byId.values()].sort(byAge);
  }, [older, latest]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const page = await loadPage(cursor);

      setOlder((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Unable to load more right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, loadPage]);

  /** Drops an item the user just deleted, wherever it was loaded from. */
  const remove = useCallback((id: string) => {
    removed.current.add(id);
    setOlder((current) => current.filter((item) => item.id !== id));
  }, []);

  /** Updates an item from an older page after it was edited (the latest page updates through its prop). */
  const replace = useCallback((item: T) => {
    setOlder((current) => current.map((existing) => (existing.id === item.id ? item : existing)));
  }, []);

  return { items, hasMore: cursor !== null, loading, error, loadMore, remove, replace };
}

/** Fetches one older page from a list endpoint; throws an Error with a safe message on failure. */
export async function fetchOlderPage<T>(url: string, cursor: string, key: string): Promise<Page<T>> {
  let response: Response;

  try {
    response = await fetch(`${url}?before=${encodeURIComponent(cursor)}`);
  } catch {
    throw new Error("Unable to reach the server. Check your connection and try again.");
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !payload || !Array.isArray(payload[key])) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "");
  }

  return {
    items: payload[key] as T[],
    nextCursor: typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}
