import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  /** "h1" when this is all the page shows (a not-found state), so the page still has a main heading. */
  titleAs?: "p" | "h1";
}

export default function EmptyState({ icon: Icon, title, description, children, titleAs: Title = "p" }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-muted dark:bg-white/5 dark:text-dark-muted">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </span>
      <Title className="mt-4 font-display text-lg font-semibold text-ink dark:text-slate-50">{title}</Title>
      <p className="mt-1 max-w-sm text-sm text-muted dark:text-dark-muted">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
