import { content } from "@/lib/content";

export default function FinalCta() {
  return (
    <section className="w-full bg-brand py-20 text-center text-white">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="font-display text-3xl font-bold md:text-4xl">
          {content.finalCta.title}
        </h2>

        <a
          href="#signup"
          className="mt-8 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand"
        >
          {content.finalCta.cta}
        </a>
      </div>
    </section>
  );
}