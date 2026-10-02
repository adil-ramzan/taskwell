export default function Problem() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
          The problem
        </p>

        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold text-ink md:text-4xl dark:text-slate-50">
          Teams lose time in status meetings and unclear task ownership.
        </h2>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="font-display text-xl font-semibold text-ink dark:text-slate-100">
              Too many status meetings
            </h3>
            <p className="mt-2 text-muted dark:text-dark-muted">
              Updates get repeated in chat, docs, and calls instead of living in one place.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-ink dark:text-slate-100">
              Unclear ownership
            </h3>
            <p className="mt-2 text-muted dark:text-dark-muted">
              Work drifts because it is not obvious who owns the next step or decision.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-ink dark:text-slate-100">
              Missed deadlines
            </h3>
            <p className="mt-2 text-muted dark:text-dark-muted">
              Without a live view of priorities, progress slips and blockers show up too late.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
