import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { UPLOAD_KEY_PATTERN } from "@/lib/avatars";

/*
 * Uploaded avatars live on the server's disk, outside public/, in
 * storage/avatars (a Docker volume in the container). Every file is written by
 * this module under a random name; nothing from the request ever becomes part of
 * a path, and every read or delete checks the name against UPLOAD_KEY_PATTERN.
 */
const AVATAR_DIR = path.join(process.cwd(), "storage", "avatars");
const OUTPUT_SIZE = 256;
// Refuse absurd dimensions before decoding (a small file can claim a huge canvas).
const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type AvatarProcessError = "unsupported" | "invalid";

/**
 * Decodes the upload as an image and re-encodes it: JPEG, PNG or WebP only
 * (decided from the bytes, not the name or MIME type), turned upright, cropped
 * to a 256px square and saved as WebP. Re-encoding drops EXIF and every other
 * piece of metadata, and anything that isn't really an image fails to decode.
 */
export async function storeAvatar(input: Buffer): Promise<{ key: string } | { error: AvatarProcessError }> {
  let format: string | undefined;

  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    return { error: "invalid" };
  }

  if (!format || !ACCEPTED_FORMATS.has(format)) {
    return { error: "unsupported" };
  }

  let output: Buffer;

  try {
    output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: "invalid" };
  }

  const key = `${randomUUID()}.webp`;

  await mkdir(AVATAR_DIR, { recursive: true });
  // "wx": never overwrite an existing file.
  await writeFile(path.join(AVATAR_DIR, key), output, { flag: "wx", mode: 0o640 });

  return { key };
}

const fileFor = (key: string) => (UPLOAD_KEY_PATTERN.test(key) ? path.join(AVATAR_DIR, key) : null);

/** The stored image, or null when the name isn't a valid upload key or the file is gone. */
export async function readAvatar(key: string) {
  const file = fileFor(key);
  if (!file) return null;

  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/** Deletes an uploaded avatar file; anything that isn't an upload key is ignored. */
export async function deleteAvatarFile(key: string | null | undefined) {
  const file = key ? fileFor(key) : null;

  if (file) {
    await rm(file, { force: true });
  }
}
