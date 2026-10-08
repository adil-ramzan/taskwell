// Shared by the server (what is stored and allowed) and the UI (what is drawn),
// so it must stay free of server-only imports.

/** How an account that has been deleted is named wherever it used to appear. */
export const DELETED_USER = "Deleted user";

/** The built-in avatars. Their IDs are what the database stores; nothing else is accepted. */
export const PRESET_AVATARS = [
  { id: "spark", label: "Sparkles", background: "#2F6FED", foreground: "#FFFFFF" },
  { id: "leaf", label: "Leaf", background: "#047857", foreground: "#FFFFFF" },
  { id: "wave", label: "Wave", background: "#0369A1", foreground: "#FFFFFF" },
  { id: "mountain", label: "Mountain", background: "#14213D", foreground: "#FFFFFF" },
  { id: "sun", label: "Sun", background: "#F2A93B", foreground: "#14213D" },
  { id: "moon", label: "Moon", background: "#6D28D9", foreground: "#FFFFFF" },
  { id: "star", label: "Star", background: "#BE123C", foreground: "#FFFFFF" },
  { id: "compass", label: "Compass", background: "#0F766E", foreground: "#FFFFFF" },
  { id: "rocket", label: "Rocket", background: "#1E4FB8", foreground: "#FFFFFF" },
  { id: "coffee", label: "Coffee", background: "#7C2D12", foreground: "#FFFFFF" },
] as const;

export type PresetAvatarId = (typeof PRESET_AVATARS)[number]["id"];

export const isPresetAvatarId = (value: unknown): value is PresetAvatarId =>
  typeof value === "string" && PRESET_AVATARS.some((avatar) => avatar.id === value);

/** An uploaded avatar's file name: always a server-made UUID plus .webp, so it can't name any other file. */
export const UPLOAD_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

/** What a page needs to draw someone's avatar. null = initials. */
export type AvatarRef = { kind: "preset"; id: PresetAvatarId } | { kind: "upload"; url: string };

/** The columns to select with a user so their avatar can be shown. */
export const avatarSelect = { avatarType: true, avatarKey: true } as const;

export function toAvatarRef(row: { avatarType: string; avatarKey: string | null } | null | undefined): AvatarRef | null {
  if (!row?.avatarKey) return null;

  if (row.avatarType === "PRESET" && isPresetAvatarId(row.avatarKey)) {
    return { kind: "preset", id: row.avatarKey };
  }

  if (row.avatarType === "UPLOAD" && UPLOAD_KEY_PATTERN.test(row.avatarKey)) {
    return { kind: "upload", url: `/api/avatars/${row.avatarKey}` };
  }

  return null;
}
