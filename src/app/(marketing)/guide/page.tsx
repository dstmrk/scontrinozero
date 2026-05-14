import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd, breadcrumbListJsonLd } from "@/components/json-ld";
import { guideArticles, guideSlugs } from "@/lib/guide/articles";

const SITE_URL = "https://scontrinozero.it";

export const metadata: Metadata = {
  title: "Guide e approfondimenti | ScontrinoZero",
  description:
    "Guide pratiche sullo scontrino elettronico, documento commerciale online, POS-RT, regime forfettario e novità normative per partite IVA italiane.",
  openGraph: {
    title: "Guide e approfondimenti | ScontrinoZero",
    description:
      "Guide pratiche sullo scontrino elettronico, documento commerciale online, POS-RT e regime forfettario.",
    url: `${SITE_URL}/guide`,
  },
  alternates: {
    canonical: `${SITE_URL}/guide`,
  },
};

export default function GuideIndexPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: "Home", url: SITE_URL },
          { name: "Guide", url: `${SITE_URL}/guide` },
        ])}
      />

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {"Torna alla home"}
          </Link>

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {"Guide e approfondimenti"}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {
              "Articoli pratici sullo scontrino elettronico, le novità normative e le scelte fiscali tipiche di chi lavora al pubblico in Italia. Informazione divulgativa, non sostituisce il commercialista."
            }
          </p>

          <div className="mt-10 space-y-4">
            {guideSlugs.map((slug) => {
              const g = guideArticles[slug];
              return (
                <Link
                  key={slug}
                  href={`/guide/${slug}`}
                  className="bg-card hover:border-primary/40 block rounded-lg border p-5 transition-colors"
                >
                  <h2 className="text-lg font-semibold">{g.title}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {g.heroIntro}
                  </p>
                  <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    {g.readingMinutes}
                    {" min di lettura · aggiornato "}
                    {g.updatedAt}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="bg-muted/40 border-border mt-12 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">
              {"Vuoi provare ScontrinoZero?"}
            </p>
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
