// Shared by the attachment API and the task page, so it must stay free of server-only imports.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** The most files one task can hold. */
export const MAX_ATTACHMENTS_PER_TASK = 20;
export const ATTACHMENT_NAME_MAX_LENGTH = 200;

type Kind = "png" | "jpeg" | "gif" | "webp" | "pdf" | "zip" | "text";

/**
 * The file types that can be attached, by extension. `mimeType` is what the
 * file is stored and served as (the type the browser sent is never used),
 * `kind` what its bytes must look like, and `inline` whether a browser may
 * show it in a tab (images only); everything else, PDFs included, is only
 * ever offered as a download, so nothing in a document is run by the app's origin.
 * Anything a browser could run (HTML, SVG, scripts) is not on the list.
 */
export const ATTACHMENT_TYPES: Record<string, { mimeType: string; kind: Kind; inline?: true }> = {
  png: { mimeType: "image/png", kind: "png", inline: true },
  jpg: { mimeType: "image/jpeg", kind: "jpeg", inline: true },
  jpeg: { mimeType: "image/jpeg", kind: "jpeg", inline: true },
  gif: { mimeType: "image/gif", kind: "gif", inline: true },
  webp: { mimeType: "image/webp", kind: "webp", inline: true },
  pdf: { mimeType: "application/pdf", kind: "pdf" },
  txt: { mimeType: "text/plain; charset=utf-8", kind: "text" },
  md: { mimeType: "text/markdown; charset=utf-8", kind: "text" },
  csv: { mimeType: "text/csv; charset=utf-8", kind: "text" },
  json: { mimeType: "application/json", kind: "text" },
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "zip" },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "zip" },
  pptx: { mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "zip" },
  zip: { mimeType: "application/zip", kind: "zip" },
};

/** For the file input's `accept` and the hint under it. */
export const ATTACHMENT_EXTENSIONS = Object.keys(ATTACHMENT_TYPES);
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(",");

/** May a browser show this stored type in a tab (images), rather than only download it. */
export const isInlineType = (mimeType: string) =>
  Object.values(ATTACHMENT_TYPES).some((type) => type.inline && type.mimeType === mimeType);

/**
 * The name a file is listed and downloaded under: only its last path segment,
 * without control characters or the characters a file system or a header
 * can't hold, white space collapsed, no leading dots, shortened to fit (the
 * extension is kept). Null when nothing usable is left.
 */
export function cleanFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const base = value.split(/[\\/]/).pop() ?? "";
  const name = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");

  if (!name) return null;
  if (name.length <= ATTACHMENT_NAME_MAX_LENGTH) return name;

  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : "";

  return `${name.slice(0, ATTACHMENT_NAME_MAX_LENGTH - extension.length).trimEnd()}${extension}`;
}

/** The lower-case extension after the last dot; "" when there is none. */
export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** Whether the content really is what its extension says. Text must be UTF-8 without NUL bytes. */
function matchesKind(bytes: Uint8Array, kind: Kind) {
  switch (kind) {
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    case "webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "zip":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "text":
      if (bytes.includes(0)) return false;

      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
  }
}

export type AttachmentProblem = "attachment-no-name" | "attachment-empty" | "attachment-too-large" | "attachment-type" | "attachment-content";

/**
 * Decides whether an upload can be kept, from its name and its bytes alone:
 * a usable name with an allowed extension, 1 byte to 10 MB, and content that
 * matches the extension. Returns the name and type to store.
 */
export function inspectUpload(
  fileName: unknown,
  bytes: Uint8Array,
): { name: string; mimeType: string } | { error: AttachmentProblem } {
  const name = cleanFileName(fileName);

  if (!name) return { error: "attachment-no-name" };
  if (bytes.length === 0) return { error: "attachment-empty" };
  if (bytes.length > ATTACHMENT_MAX_BYTES) return { error: "attachment-too-large" };

  const type = ATTACHMENT_TYPES[extensionOf(name)];

  if (!type) return { error: "attachment-type" };
  if (!matchesKind(bytes, type.kind)) return { error: "attachment-content" };

  return { name, mimeType: type.mimeType };
}

/** "812 B", "14.2 KB", "3.4 MB". */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
