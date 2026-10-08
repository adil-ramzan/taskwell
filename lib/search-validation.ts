// Shared by the command palette (client) and /api/search (server).

/** Shorter queries only filter the palette's own commands; nothing is sent to the server. */
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;
/** Words beyond this are ignored, so one request can't build an arbitrarily large filter. */
export const SEARCH_MAX_TERMS = 5;
/** The most results returned per category (tasks, projects, teams). */
export const SEARCH_RESULT_LIMIT = 5;

/** Trims and collapses whitespace, so "  design   task " and "design task" are the same query. */
export function normalizeSearchQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** The normalized query, or the message for a 400. */
export function validateSearchQuery(value: unknown): { data: string } | { error: string } {
  if (typeof value !== "string") {
    return { error: "Provide a search query, for example /api/search?q=design." };
  }

  const query = normalizeSearchQuery(value);

  if (query.length < SEARCH_QUERY_MIN_LENGTH) {
    return { error: `Enter at least ${SEARCH_QUERY_MIN_LENGTH} characters to search.` };
  }

  if (query.length > SEARCH_QUERY_MAX_LENGTH) {
    return { error: `A search can be at most ${SEARCH_QUERY_MAX_LENGTH} characters.` };
  }

  return { data: query };
}
