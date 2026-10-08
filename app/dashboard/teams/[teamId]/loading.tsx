const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

// Also shown while the team's Members and Settings pages load.
export default function TeamLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading team…</span>
      <div aria-hidden="true" className={`${block} h-6 w-32 rounded-lg`} />
      <div aria-hidden="true" className={`${block} h-32`} />
      <div aria-hidden="true" className={`${block} h-12 w-72 max-w-full rounded-full`} />
      <div aria-hidden="true" className={`${block} h-64`} />
    </div>
  );
}
