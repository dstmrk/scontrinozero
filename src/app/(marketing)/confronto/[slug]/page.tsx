import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd, breadcrumbListJsonLd } from "@/components/json-ld";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import {
  comparisons,
  comparisonSlugs,
  isComparisonSlug,
} from "@/lib/confronto/comparisons";
import { helpArticles } from "@/lib/help/articles";

const SITE_URL = "https://scontrinozero.it";

interface PageParams {
  readonly params: Promise<{ readonly slug: string }>;
}

export function generateStaticParams() {
  return comparisonSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  if (!isComparisonSlug(slug)) {
    return { title: "Confronto non trovato | ScontrinoZero" };
  }
  const c = comparisons[slug];
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url: `${SITE_URL}/confronto/${c.slug}`,
    },
    alternates: {
      canonical: `${SITE_URL}/confronto/${c.slug}`,
    },
  };
}

export default async function ComparisonPage({ params }: PageParams) {
  const { slug } = await params;
  if (!isComparisonSlug(slug)) {
    notFound();
  }
  const c = comparisons[slug];

  const pageUrl = `${SITE_URL}/confronto/${c.slug}`;
  const relatedArticles = c.relatedHelp
    .map((helpSlug) => helpArticles[helpSlug])
    .filter((a) => a !== undefined);
  const otherComparisons = comparisonSlugs.filter((s) => s !== c.slug);

  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: "Home", url: SITE_URL },
          { name: "Confronti", url: `${SITE_URL}/` },
          { name: c.title, url: pageUrl },
        ])}
      />

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {"Tutti i confronti"}
          </Link>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {c.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {c.heroIntro}
          </p>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/register">
                {"Prova ScontrinoZero gratis "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <span className="text-muted-foreground text-sm">
              {"30 giorni gratis · da €2,50/mese · nessuna carta richiesta"}
            </span>
          </div>

          <h2 className="mt-12 text-xl font-semibold">{"Confronto diretto"}</h2>
          <div className="mt-4">
            <ComparisonTable competitorLabel={c.competitorName} rows={c.rows} />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {"Ultimo aggiornamento: "}
            {c.lastUpdated}
            {
              ". Listini e funzionalità dei competitor possono cambiare: verifica sempre sui siti ufficiali."
            }
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <div className="bg-muted/40 rounded-lg border p-5">
              <h3 className="font-semibold">
                {"Quando scegliere "}
                {c.competitorName}
              </h3>
              <ul className="mt-3 space-y-2">
                {c.whenToChoose.competitor.map((item) => (
                  <li
                    key={item}
                    className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
                  >
                    <X className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-primary/5 border-primary/20 rounded-lg border p-5">
              <h3 className="text-primary font-semibold">
                {"Quando scegliere ScontrinoZero"}
              </h3>
              <ul className="mt-3 space-y-2">
                {c.whenToChoose.us.map((item) => (
                  <li
                    key={item}
                    className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
                  >
                    <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h2 className="mt-12 text-xl font-semibold">{"Domande frequenti"}</h2>
          <div className="mt-3 space-y-5">
            {c.faq.map((item) => (
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
              <h2 className="mt-12 text-xl font-semibold">
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

          {otherComparisons.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">
                {"Altri confronti"}
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {otherComparisons.map((otherSlug) => (
                  <li key={otherSlug}>
                    <Link
                      href={`/confronto/${otherSlug}`}
                      className="text-primary hover:underline"
                    >
                      {comparisons[otherSlug].title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="bg-muted/40 border-border mt-10 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">{"Pronto a provare?"}</p>
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
