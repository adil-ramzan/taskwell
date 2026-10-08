const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function CalendarLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading calendar…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className={`${block} h-8 w-40 max-w-full`} />
          <div className={`${block} h-4 w-80 max-w-full`} />
        </div>
        <div className={`${block} h-11 w-36 rounded-lg`} />
      </div>
      <div aria-hidden="true" className={`${block} h-12 rounded-xl`} />
      <div aria-hidden="true" className={`${block} h-[28rem] rounded-xl`} />
    </div>
  );
}
