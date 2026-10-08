interface PageIntroProps {
  title: string;
  description: string;
}

export default function PageIntro({ title, description }: PageIntroProps) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink dark:text-slate-50 sm:text-3xl">{title}</h1>
      <p className="mt-1 text-muted dark:text-dark-muted">{description}</p>
    </div>
  );
}
