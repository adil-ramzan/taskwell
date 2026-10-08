const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function TaskBoardLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading task board…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className={`${block} h-8 w-48 max-w-full`} />
          <div className={`${block} h-4 w-80 max-w-full`} />
        </div>
        <div className={`${block} h-11 w-72 max-w-full rounded-lg`} />
      </div>
      <div aria-hidden="true" className={`${block} h-11 rounded-lg`} />
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${block} h-72`} />
        ))}
      </div>
    </div>
  );
}
