import { content } from "@/lib/content";

export default function HowItWorks() {
  return (
    <section id="how" className="bg-ink py-20 text-paper dark:bg-dark-background dark:text-slate-50">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-3xl font-bold">How it works</h2>

        <ol className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {content.steps.map((step, index) => (
            <li key={step.title}>
              <p className="text-accent">Step {index + 1}</p>

              <h3 className="mt-2 text-xl font-semibold">
                {step.title}
              </h3>

              <p className="mt-2 text-paper/70 dark:text-dark-muted">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}