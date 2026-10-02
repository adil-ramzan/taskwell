import { content } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-paper dark:border-white/10 dark:bg-dark-surface">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="font-display text-xl font-bold text-ink dark:text-slate-50">
              {content.brand}
            </div>
            <p className="mt-2 text-sm text-muted dark:text-dark-muted">
              One live board for your team&apos;s tasks, owners, and deadlines.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted sm:gap-x-6 dark:text-dark-muted">
            <a href="#how" className="transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-100 dark:focus:ring-offset-dark-surface">
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-100 dark:focus:ring-offset-dark-surface">
              Pricing
            </a>
            <a href="#faq" className="transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-100 dark:focus:ring-offset-dark-surface">
              FAQ
            </a>
            <a href="#signup" className="transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:hover:text-slate-100 dark:focus:ring-offset-dark-surface">
              Start free trial
            </a>
          </nav>
        </div>

        <p className="mt-8 border-t border-ink/10 pt-6 text-sm text-muted dark:border-white/10 dark:text-dark-muted">
          © 2026 Taskwell. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
