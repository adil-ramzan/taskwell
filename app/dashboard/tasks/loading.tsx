const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function TasksLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading tasks…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className={`${block} h-8 w-32 max-w-full`} />
          <div className={`${block} h-4 w-80 max-w-full`} />
        </div>
        <div className={`${block} h-11 w-36 rounded-lg`} />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 lg:flex-row lg:justify-between">
        <div className={`${block} h-12 w-full rounded-full lg:w-[34rem]`} />
        <div className={`${block} h-11 rounded-lg lg:w-64`} />
      </div>
      <div aria-hidden="true" className={`${block} h-80 rounded-xl`} />
    </div>
  );
}
