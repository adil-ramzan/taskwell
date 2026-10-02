import { content } from "@/lib/content";

export default function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid gap-8 md:grid-cols-2">
        {content.testimonials.map((testimonial) => (
          <figure
            key={testimonial.name}
            className="border-l-4 border-brand pl-5"
          >
            <blockquote className="text-xl">
              “{testimonial.quote}”
            </blockquote>

            <figcaption className="mt-4 text-sm text-muted dark:text-dark-muted">
              {testimonial.name}, {testimonial.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}