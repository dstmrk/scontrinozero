import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd, breadcrumbListJsonLd } from "@/components/json-ld";
import { categories, categorySlugs } from "@/lib/per/categories";

const SITE_URL = "https://scontrinozero.it";
const PAGE_URL = `${SITE_URL}/per`;

export const metadata: Metadata = {
  title: "Soluzioni per categoria",
  description:
    "ScontrinoZero adattato per ambulanti, parrucchieri ed estetisti, artigiani, B&B, regime forfettario e liberi professionisti. Trova la pagina della tua categoria.",
  openGraph: {
    title: "Soluzioni per categoria | ScontrinoZero",
    description:
      "Pagine dedicate a ogni tipo di attività: ambulanti, parrucchieri, artigiani, B&B, forfettari e professionisti.",
    url: PAGE_URL,
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

export default function PerIndexPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: "Home", url: SITE_URL },
          { name: "Soluzioni per categoria", url: PAGE_URL },
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
            {"Soluzioni per categoria"}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {
              "Ogni attività ha esigenze diverse. Abbiamo preparato una pagina dedicata per i casi d'uso più comuni: obblighi fiscali, vantaggi pratici e domande frequenti specifici per ciascuna categoria."
            }
          </p>

          <div className="mt-10 space-y-4">
            {categorySlugs.map((slug) => {
              const c = categories[slug];
              return (
                <Link
                  key={slug}
                  href={`/per/${slug}`}
                  className="bg-card hover:border-primary/40 block rounded-lg border p-5 transition-colors"
                >
                  <h2 className="text-lg font-semibold">{c.title}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {c.heroSubtitle}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="bg-muted/40 border-border mt-12 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">
              {"Non trovi la tua categoria?"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {
                "ScontrinoZero funziona per qualsiasi partita IVA con vendite o servizi B2C. Inizia i 30 giorni di prova gratuita."
              }
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
