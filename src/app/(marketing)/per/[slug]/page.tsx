import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  JsonLd,
  breadcrumbListJsonLd,
  serviceJsonLd,
} from "@/components/json-ld";
import {
  categories,
  categorySlugs,
  type CategorySlug,
} from "@/lib/per/categories";
import { helpArticles } from "@/lib/help/articles";

const SITE_URL = "https://scontrinozero.it";

interface PageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams() {
  return categorySlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const category = categories[slug as CategorySlug];
  if (!category) {
    return { title: "Categoria non trovata | ScontrinoZero" };
  }
  return {
    title: category.metaTitle,
    description: category.metaDescription,
    openGraph: {
      title: category.metaTitle,
      description: category.metaDescription,
      url: `${SITE_URL}/per/${category.slug}`,
    },
    alternates: {
      canonical: `${SITE_URL}/per/${category.slug}`,
    },
  };
}

export default async function CategoryLandingPage({ params }: PageParams) {
  const { slug } = await params;
  const category = categories[slug as CategorySlug];
  if (!category) {
    notFound();
  }

  const pageUrl = `${SITE_URL}/per/${category.slug}`;
  const relatedArticles = category.relatedHelp
    .map((helpSlug) => helpArticles[helpSlug])
    .filter((a) => a !== undefined);

  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: "Home", url: SITE_URL },
          { name: "Soluzioni per categoria", url: `${SITE_URL}/` },
          { name: category.title, url: pageUrl },
        ])}
      />
      <JsonLd
        data={serviceJsonLd({
          name: category.title,
          description: category.metaDescription,
          url: pageUrl,
          audience: category.audience,
        })}
      />

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {"Tutte le categorie"}
          </Link>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {category.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {category.heroSubtitle}
          </p>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/register">
                {"Inizia gratis "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <span className="text-muted-foreground text-sm">
              {"30 giorni gratis · da €2,50/mese · nessuna carta richiesta"}
            </span>
          </div>

          <h2 className="mt-12 text-xl font-semibold">{"Il caso d'uso"}</h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {category.useCase}
          </p>

          <h2 className="mt-10 text-xl font-semibold">
            {"Obblighi fiscali da rispettare"}
          </h2>
          <ul className="mt-3 space-y-2">
            {category.obligations.map((item) => (
              <li
                key={item}
                className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
              >
                <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-10 text-xl font-semibold">
            {"Come funziona ScontrinoZero per "}
            {category.audience.split(",")[0]}
          </h2>
          <ul className="mt-3 space-y-2">
            {category.benefits.map((item) => (
              <li
                key={item}
                className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
              >
                <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-10 text-xl font-semibold">{"Domande frequenti"}</h2>
          <div className="mt-3 space-y-5">
            {category.faq.map((item) => (
              <div key={item.question}>
                <p className="text-sm font-medium">{item.question}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>

          {relatedArticles.length > 0 && (
            <>
              <h2 className="mt-10 text-xl font-semibold">
                {"Approfondimenti dall'Help Center"}
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {relatedArticles.map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={`/help/${article.slug}`}
                      className="text-primary hover:underline"
                    >
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="bg-muted/40 border-border mt-10 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">{"Pronto a iniziare?"}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {"30 giorni di prova gratuita, senza carta di credito."}
            </p>
            <Button asChild className="mt-3">
              <Link href="/register">
                {"Crea l'account "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </article>
      </section>
    </>
  );
}
