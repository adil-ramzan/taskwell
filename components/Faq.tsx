import { content } from "@/lib/content";

export default function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
      <h2 className="font-display text-3xl font-bold">Questions</h2>

      <div className="mt-8 divide-y divide-ink/10 dark:divide-white/10">
        {content.faq.map((item) => (
          <details key={item.question} className="py-5">
            <summary className="cursor-pointer font-semibold text-ink focus-visible:rounded-sm dark:text-slate-100">
              {item.question}
            </summary>

            <p className="mt-3 text-muted dark:text-dark-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}