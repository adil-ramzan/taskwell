const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function ProjectsLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading projects…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className={`${block} h-8 w-40 max-w-full`} />
          <div className={`${block} h-4 w-80 max-w-full`} />
        </div>
        <div className={`${block} h-11 w-40 rounded-lg`} />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row">
        <div className={`${block} h-11 flex-1 rounded-lg`} />
        <div className={`${block} h-11 rounded-lg sm:w-56`} />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={`${block} h-52`} />
        ))}
      </div>
    </div>
  );
}
