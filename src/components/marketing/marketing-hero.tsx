import type { ReactNode } from "react";

interface MarketingHeroProps {
  title: ReactNode;
  subtitle: string;
  children?: ReactNode;
}

export function MarketingHero({
  title,
  subtitle,
  children,
}: Readonly<MarketingHeroProps>) {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg">
          {subtitle}
        </p>
        {children}
      </div>
    </section>
  );
}
