import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  /** Null means there is no data source yet, which is shown as "No data yet" rather than 0. */
  value: number | string | null;
  description: string;
}

export default function StatCard({ label, icon: Icon, value, description }: StatCardProps) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted dark:text-dark-muted">{label}</p>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand-dark dark:bg-brand/20 dark:text-slate-100">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      {value === null ? (
        <p className="mt-4 font-display text-xl font-semibold text-muted dark:text-dark-muted">
          No data yet
        </p>
      ) : (
        <p className="mt-4 font-display text-2xl font-bold text-ink dark:text-slate-50">{value}</p>
      )}
      <p className="mt-1 text-xs text-muted dark:text-dark-muted">{description}</p>
    </div>
  );
}
