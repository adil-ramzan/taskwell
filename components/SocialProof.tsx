import { content } from "@/lib/content";

export default function SocialProof() {
  return (
    <section
      aria-label="Trusted by"
      className="w-full border-y border-ink/10 py-6 dark:border-white/10"
    >
      <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-10 gap-y-3 px-5 font-display text-lg text-muted dark:text-dark-muted">
        {content.proof.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </section>
  );
}