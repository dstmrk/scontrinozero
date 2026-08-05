import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { JsonLd, breadcrumbListJsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import {
  helpHubCategories,
  helpHubFeaturedSlugs,
  resolveHubArticle,
} from "@/lib/help/hub-categories";

const SITE_URL = "https://scontrinozero.it";
const PAGE_URL = `${SITE_URL}/help`;

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Guide, tutorial e risposte alle domande frequenti su ScontrinoZero: collegamento AdE, emissione scontrini, configurazione fiscale e molto altro.",
  openGraph: {
    title: "Help Center | ScontrinoZero",
    description:
      "Guide, tutorial e risposte alle domande frequenti su ScontrinoZero: collegamento AdE, emissione scontrini, configurazione fiscale e molto altro.",
    url: PAGE_URL,
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

const featuredArticles = helpHubFeaturedSlugs.map((slug) =>
  resolveHubArticle({ slug }),
);

const helpCategories = helpHubCategories.map((category) => ({
  ...category,
  articles: category.articles.map(resolveHubArticle),
}));

export default function HelpHomePage() {
  const crumbs = [
    { name: "Home", url: SITE_URL },
    { name: "Help Center", url: PAGE_URL },
  ];
  return (
    <section className="px-4 py-16 md:py-24">
      <JsonLd data={breadcrumbListJsonLd(crumbs)} />
      <div className="mx-auto max-w-6xl space-y-12">
        <Breadcrumbs items={crumbs} />

        {/* ─── Intestazione ─── */}
        <div className="space-y-3">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">
            Help Center
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Centro assistenza ScontrinoZero
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Guide passo-passo, risposte alle domande frequenti e riferimenti
            tecnici per usare ScontrinoZero al meglio.
          </p>
        </div>

        {/* ─── Articoli più letti ─── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Articoli più letti</h2>
          <ul className="divide-border divide-y rounded-lg border">
            {featuredArticles.map((article) => (
              <li key={article.href}>
                <Link
                  href={article.href}
                  className="hover:bg-muted/50 flex items-center justify-between px-4 py-3 text-sm transition-colors"
                >
                  <span>{article.title}</span>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ─── Categorie ─── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Tutte le categorie</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {helpCategories.map((category) => (
              <Card key={category.name}>
                <CardHeader>
                  <CardTitle className="text-xl">{category.name}</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {category.description}
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm leading-relaxed">
                    {category.articles.map((article) => (
                      <li key={article.href} className="flex items-start gap-2">
                        <span className="text-muted-foreground mt-0.5">›</span>
                        <Link
                          href={article.href}
                          className="text-primary hover:underline"
                        >
                          {article.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {category.categoryHref && (
                    <Link
                      href={category.categoryHref}
                      className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
                    >
                      Consulta la documentazione completa →
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ─── Contatto supporto ─── */}
        <div className="bg-muted/50 rounded-lg px-6 py-5">
          <p className="text-sm font-medium">
            Non hai trovato quello che cerchi?
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {"Scrivici a "}
            <a
              href="mailto:info@scontrinozero.it"
              className="text-primary hover:underline"
            >
              info@scontrinozero.it
            </a>
            {" e ti rispondiamo entro 24 ore."}
          </p>
        </div>
      </div>
    </section>
  );
}
