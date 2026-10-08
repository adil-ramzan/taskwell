import type { LabelColor, LabelRef } from "@/lib/label-rules";

// Written out in full so Tailwind sees every class. Each pair keeps the text at 4.5:1 or better on its tint.
const chipColors: Record<LabelColor, string> = {
  gray: "bg-slate-100 text-slate-800 dark:bg-slate-400/20 dark:text-slate-100",
  red: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100",
  orange: "bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-100",
  yellow: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-100",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/25 dark:text-blue-100",
  purple: "bg-violet-100 text-violet-800 dark:bg-violet-500/25 dark:text-violet-100",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-100",
};

/** The solid colour of each palette entry, for the swatches of the colour picker. */
export const swatchColors: Record<LabelColor, string> = {
  gray: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
};

/** A label as it appears on a task: its name on a tint of its colour. The name is always written out, never colour alone. */
export default function LabelChip({ label, className = "" }: { label: Pick<LabelRef, "name" | "color">; className?: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium ${chipColors[label.color] ?? chipColors.gray} ${className}`}
    >
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{label.name}</span>
    </span>
  );
}

/** A task's labels in a row that wraps; nothing at all when it has none. */
export function LabelList({ labels, className = "" }: { labels: Pick<LabelRef, "id" | "name" | "color">[]; className?: string }) {
  if (labels.length === 0) return null;

  return (
    <ul aria-label="Labels" className={`flex flex-wrap gap-1 ${className}`}>
      {labels.map((label) => (
        <li key={label.id} className="max-w-full">
          <LabelChip label={label} />
        </li>
      ))}
    </ul>
  );
}
