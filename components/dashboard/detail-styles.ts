// Shared by the task and project detail pages.
export const backLinkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-dark-muted dark:hover:text-slate-50";

const actionButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-white px-5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 dark:bg-dark-surface";

export const editButtonClass = `${actionButtonClass} border-ink/15 text-ink hover:border-brand hover:text-brand focus-visible:ring-brand dark:border-white/15 dark:text-slate-100`;

export const deleteButtonClass = `${actionButtonClass} border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-600 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10`;

/** Compact icon-only variants for list rows and cards; pair with an aria-label. */
const iconButtonClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border focus-visible:outline-none focus-visible:ring-2";

export const editIconButtonClass = `${iconButtonClass} border-ink/15 text-muted hover:border-brand hover:text-brand focus-visible:ring-brand dark:border-white/15 dark:text-dark-muted dark:hover:text-slate-50`;

export const deleteIconButtonClass = `${iconButtonClass} border-ink/15 text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-600 dark:border-white/15 dark:text-dark-muted dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300`;

export const cardClass =
  "rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-dark-surface sm:p-6";

export const termClass = "text-xs font-medium text-muted dark:text-dark-muted";
export const valueClass = "mt-1 text-sm font-medium text-ink dark:text-slate-100";
