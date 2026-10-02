import { content } from "@/lib/content";
import SignupForm from "./SignupForm";

export default function Hero() {
  const { hero } = content;

  return (
    <section
      id="signup"
      aria-labelledby="hero-title"
      className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:pt-20"
    >
      <div className="max-w-2xl text-left">
        <h1
          id="hero-title"
          className="font-display text-4xl font-bold md:text-6xl"
        >
          {hero.title}
        </h1>

        <p className="mt-5 max-w-xl text-lg text-muted dark:text-dark-muted">
          {hero.sub}
        </p>

        <div className="mt-8">
          <SignupForm cta={hero.cta} />

          <p className="mt-3 text-sm text-muted dark:text-dark-muted">
            {hero.note}
          </p>
        </div>

        {/* TODO: Replace with an optimized product screenshot using next/image. */}
      </div>
    </section>
  );
}