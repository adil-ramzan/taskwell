"use client";

import { Coffee, Compass, Leaf, Moon, Mountain, Rocket, Sparkles, Star, Sun, Waves, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { PRESET_AVATARS, type AvatarRef, type PresetAvatarId } from "@/lib/avatars";

export function getInitials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials =
    parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2);

  return initials.toUpperCase() || "?";
}

export const presetIcons: Record<PresetAvatarId, LucideIcon> = {
  spark: Sparkles,
  leaf: Leaf,
  wave: Waves,
  mountain: Mountain,
  sun: Sun,
  moon: Moon,
  star: Star,
  compass: Compass,
  rocket: Rocket,
  coffee: Coffee,
};

const sizes = {
  xs: { box: "h-6 w-6 text-[10px]", icon: "h-3.5 w-3.5" },
  sm: { box: "h-8 w-8 text-xs", icon: "h-4 w-4" },
  md: { box: "h-10 w-10 text-sm", icon: "h-5 w-5" },
  lg: { box: "h-20 w-20 text-2xl", icon: "h-10 w-10" },
};

interface UserAvatarProps {
  name: string;
  email: string;
  /** Uploaded picture or built-in avatar; null or missing shows initials. */
  avatar?: AvatarRef | null;
  size?: keyof typeof sizes;
}

/**
 * A person's avatar: their uploaded picture, a built-in avatar, or their
 * initials. Decorative (the name is always shown as text next to it). A picture
 * that can't be loaded, e.g. a former teammate's, falls back to initials.
 */
export default function UserAvatar({ name, email, avatar, size = "md" }: UserAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const { box, icon } = sizes[size];
  const round = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${box}`;

  if (avatar?.kind === "upload" && failed !== avatar.url) {
    return (
      <span aria-hidden="true" className={`${round} bg-ink/5 dark:bg-white/10`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, already-resized image from our own API */}
        <img src={avatar.url} alt="" className="h-full w-full object-cover" onError={() => setFailed(avatar.url)} />
      </span>
    );
  }

  if (avatar?.kind === "preset") {
    const preset = PRESET_AVATARS.find((item) => item.id === avatar.id);
    const Icon = presetIcons[avatar.id];

    if (preset && Icon) {
      return (
        <span aria-hidden="true" className={round} style={{ backgroundColor: preset.background, color: preset.foreground }}>
          <Icon className={icon} />
        </span>
      );
    }
  }

  return (
    <span
      aria-hidden="true"
      className={`${round} bg-brand/10 font-semibold text-brand-dark dark:bg-brand/25 dark:text-slate-50`}
    >
      {getInitials(name, email)}
    </span>
  );
}
