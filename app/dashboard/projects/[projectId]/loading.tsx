const block = "rounded-2xl bg-ink/5 dark:bg-white/5 motion-safe:animate-pulse";

export default function ProjectDetailLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading project…</span>
      <div aria-hidden="true" className={`${block} h-6 w-36 rounded-lg`} />
      <div aria-hidden="true" className={`${block} h-48`} />
      <div aria-hidden="true" className={`${block} h-12 w-full rounded-full lg:w-[34rem]`} />
      <div aria-hidden="true" className={`${block} h-64 rounded-xl`} />
    </div>
  );
}
