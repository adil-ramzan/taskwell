import { content } from "@/lib/content";

export default function Features() {
  const { features } = content;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-bold text-ink dark:text-slate-50">
            {features.heading}
          </h2>
          <p className="mt-4 text-muted dark:text-dark-muted">{features.text}</p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {features.items.map((feature) => (
            <div key={feature.title}>
              <p className="font-display text-xl font-semibold text-ink dark:text-slate-100">
                {feature.title}
              </p>
              <p className="mt-2 text-muted dark:text-dark-muted">{feature.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
