import { content } from "@/lib/content";
import { getSubscriberCount } from "@/lib/subscribers";

export default async function Results() {
  const subscriberCount = await getSubscriberCount();
  const resultText =
    subscriberCount && subscriberCount > 0
      ? `${subscriberCount.toLocaleString("en-US")} ${subscriberCount === 1 ? "person has" : "people have"} joined the Taskwell list.`
      : content.resultsFallback;

  return (
    <section
      aria-label="Taskwell results"
      className="w-full border-b border-ink/10 py-4 text-center dark:border-white/10"
    >
      <p className="mx-auto max-w-6xl px-5 text-sm text-muted dark:text-dark-muted">
        {resultText}
      </p>
    </section>
  );
}