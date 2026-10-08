import "server-only";

export const PAGE_SIZE = 50;

type Position = { createdAt: Date; id: string };

/*
 * Cursors for "load older" paging, newest first. A cursor is an opaque string
 * for the client: it encodes only the position (time and ID) of the oldest item
 * already loaded, so paging keeps working if that item is deleted meanwhile.
 * It carries no authority: every paged query still applies the task access
 * filter for the session user.
 */
export function encodeCursor({ createdAt, id }: Position) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

/** Null when the value isn't a cursor this server produced. */
export function decodeCursor(value: string): Position | null {
  if (value.length > 200) return null;

  const [time, id, ...rest] = Buffer.from(value, "base64url").toString("utf8").split("|");
  const createdAt = new Date(time);

  if (rest.length > 0 || !id || id.length > 100 || Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return { createdAt, id };
}

/** Prisma filter and order for rows strictly older than the cursor, newest first. */
export const olderThan = (cursor: Position | undefined) =>
  cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {};

export const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/** Splits `size` + 1 fetched rows into the page and the cursor for the next (older) page. */
export function toPage<T extends Position>(rows: T[], size = PAGE_SIZE) {
  const page = rows.slice(0, size);

  return { page, nextCursor: rows.length > size ? encodeCursor(page[page.length - 1]) : null };
}
