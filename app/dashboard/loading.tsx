const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className={`${block} h-8 w-64 max-w-full`} />
        <div className={`${block} h-4 w-80 max-w-full`} />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${block} h-32`} />
        ))}
      </div>
      <div aria-hidden="true" className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
        <div className={`${block} h-72`} />
        <div className={`${block} h-72`} />
        <div className={`${block} h-56`} />
        <div className={`${block} h-56`} />
      </div>
      <div aria-hidden="true" className={`${block} h-48`} />
    </div>
  );
}
