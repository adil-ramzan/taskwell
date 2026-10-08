import { content } from "@/lib/content";

export default function ProductShowcase() {
  const { productShowcase } = content;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-dark dark:text-blue-300">
            {productShowcase.eyebrow}
          </p>

          <h2 className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl dark:text-slate-50">
            {productShowcase.title}
          </h2>

          <p className="mt-4 text-base text-muted md:text-lg dark:text-dark-muted">
            {productShowcase.text}
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <div className="border-b border-ink/10 bg-paper px-4 py-3 md:px-6 dark:border-white/10 dark:bg-dark-background">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-ink/20 dark:bg-white/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/20 dark:bg-white/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/20 dark:bg-white/30" />
            </div>
          </div>

          <div className="grid gap-0 md:grid-cols-[1.3fr_2.2fr]">
            <aside className="border-b border-ink/10 bg-paper p-4 md:border-b-0 md:border-r dark:border-white/10 dark:bg-dark-background">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted dark:text-dark-muted">
                    Workspaces
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-medium text-ink dark:bg-brand/15 dark:text-slate-100">
                      Launch sprint
                    </div>
                    <div className="rounded-lg border border-ink/10 px-3 py-2 text-sm text-muted dark:border-white/10 dark:text-dark-muted">
                      Ops backlog
                    </div>
                    <div className="rounded-lg border border-ink/10 px-3 py-2 text-sm text-muted dark:border-white/10 dark:text-dark-muted">
                      Client requests
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted dark:text-dark-muted">
                    Today
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-muted dark:text-dark-muted">
                    <div className="flex items-center justify-between">
                      <span>Review copy</span>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-dark dark:text-blue-200">
                        2h
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>QA pass</span>
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-ink dark:text-amber-200">
                        Due
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <div className="p-4 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-ink dark:text-slate-100">
                  Launch sprint
                </h3>
                <span className="rounded-full border border-ink/10 px-2.5 py-1 text-xs font-medium text-muted dark:border-white/10 dark:text-dark-muted">
                  12 tasks
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-paper px-3 py-3 dark:border-white/10 dark:bg-dark-background">
                  <div>
                    <p className="font-medium text-ink dark:text-slate-100">Write launch email</p>
                    <p className="text-sm text-muted dark:text-dark-muted">Owner: Maya</p>
                  </div>
                  <span className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white">
                    In progress
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-paper px-3 py-3 dark:border-white/10 dark:bg-dark-background">
                  <div>
                    <p className="font-medium text-ink dark:text-slate-100">Update pricing page</p>
                    <p className="text-sm text-muted dark:text-dark-muted">Owner: Eli</p>
                  </div>
                  <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark dark:text-blue-200">
                    Ready
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-paper px-3 py-3 dark:border-white/10 dark:bg-dark-background">
                  <div>
                    <p className="font-medium text-ink dark:text-slate-100">QA checklist</p>
                    <p className="text-sm text-muted dark:text-dark-muted">Owner: Nina</p>
                  </div>
                    <span className="rounded-lg bg-accent/20 px-2.5 py-1 text-xs font-semibold text-ink dark:text-amber-200">
                    Due today
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
