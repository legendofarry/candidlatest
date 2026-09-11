export function ProsePage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl animate-rise space-y-6">
      <header>
        <h1 className="text-3xl font-semibold md:text-4xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{intro}</p>
      </header>
      <div className="space-y-6 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
