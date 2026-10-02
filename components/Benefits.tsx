import { content } from "@/lib/content";

export default function Benefits() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
        {content.benefits.map((benefit) => (
          <div key={benefit.title}>
            <h2 className="font-display text-2xl font-semibold text-ink dark:text-slate-100">
              {benefit.title}
            </h2>

            <p className="mt-2 text-muted dark:text-dark-muted">
              {benefit.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}