const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function TaskDetailLoading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-4xl space-y-4">
      <span className="sr-only">Loading task…</span>
      <div aria-hidden="true" className={`${block} h-6 w-32 rounded-lg`} />
      <div aria-hidden="true" className={`${block} h-72`} />
      <div aria-hidden="true" className={`${block} h-56`} />
      <div aria-hidden="true" className={`${block} h-40`} />
    </div>
  );
}
