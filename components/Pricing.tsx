import { content } from "@/lib/content";

export default function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
      <h2 className="font-display text-3xl font-bold">Simple pricing</h2>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {content.plans.map((plan) => {
          const featured = plan.featured;

          return (
            <div
              key={plan.name}
              className={
                featured
                  ? "border-2 border-brand bg-white p-6 shadow-lg dark:bg-dark-surface"
                  : "border border-ink/15 p-6 dark:border-white/10 dark:bg-dark-surface"
              }
            >
              <h3 className="font-display text-xl font-semibold">
                {plan.name}
              </h3>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted dark:text-dark-muted">/user/mo</span>
              </div>

              <ul className="mt-6 space-y-3 text-muted dark:text-dark-muted">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <a
                href="#signup"
                className={
                  featured
                    ? "mt-8 block rounded-lg bg-brand px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                    : "mt-8 block rounded-lg border border-brand px-5 py-3 text-center font-semibold text-brand-dark transition-colors hover:bg-brand/10 dark:text-blue-300 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 dark:focus:ring-offset-dark-surface"
                }
              >
                Choose {plan.name}
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}