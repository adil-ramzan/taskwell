import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Attached files live on the server's disk, outside public/, in
 * storage/attachments (a Docker volume in the container), beside the avatars
 * and under the same rules: every file is written by this module under a
 * random name; nothing from the request ever becomes part of a path; and every
 * read or delete checks the name against STORAGE_KEY_PATTERN first. The files
 * are only ever served through the attachment API, after the task's access check.
 */
const ATTACHMENT_DIR = path.join(process.cwd(), "storage", "attachments");

export const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fileFor = (key: string) => (STORAGE_KEY_PATTERN.test(key) ? path.join(ATTACHMENT_DIR, key) : null);

export const sha256Of = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Writes the bytes under a new random name and returns it. */
export async function storeAttachmentFile(bytes: Uint8Array) {
  const key = randomUUID();

  await mkdir(ATTACHMENT_DIR, { recursive: true });
  // "wx": never overwrite an existing file. Not executable, not world-readable.
  await writeFile(path.join(ATTACHMENT_DIR, key), bytes, { flag: "wx", mode: 0o640 });

  return key;
}

/** The stored bytes, or null when the name isn't a storage key or the file is gone. */
export async function readAttachmentFile(key: string) {
  const file = fileFor(key);
  if (!file) return null;

  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Deletes stored files; anything that isn't a storage key is ignored, and a missing file is not an error. */
export async function deleteAttachmentFiles(keys: readonly string[]) {
  await Promise.all(
    keys.map(async (key) => {
      const file = fileFor(key);

      if (file) await rm(file, { force: true }).catch(() => {});
    }),
  );
}

/** Stored files older than `olderThanMs`, by name: the candidates for the orphan sweep. */
export async function listStoredAttachmentKeys(olderThanMs: number) {
  const names = await readdir(ATTACHMENT_DIR).catch(() => [] as string[]);
  const cutoff = Date.now() - olderThanMs;
  const keys: string[] = [];

  for (const name of names) {
    if (!STORAGE_KEY_PATTERN.test(name)) continue;

    const info = await stat(path.join(ATTACHMENT_DIR, name)).catch(() => null);

    if (info?.isFile() && info.mtimeMs < cutoff) keys.push(name);
  }

  return keys;
}
