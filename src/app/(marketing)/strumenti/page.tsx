import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appHref } from "@/lib/marketing-to-app-href";
import { Button } from "@/components/ui/button";
import { JsonLd, breadcrumbListJsonLd } from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { tools, toolSlugs } from "@/lib/strumenti/tools";

const SITE_URL = "https://scontrinozero.it";
const PAGE_URL = `${SITE_URL}/strumenti`;

export const metadata: Metadata = {
  title: "Strumenti gratuiti",
  description:
    "Calcolatori e verifiche gratuite per partite IVA: scorporo IVA, codice Lotteria degli Scontrini e risparmio rispetto al registratore telematico. Senza registrazione.",
  openGraph: {
    title: "Strumenti gratuiti | ScontrinoZero",
    description:
      "Scorporo IVA, verifica codice Lotteria degli Scontrini e calcolatore di risparmio: strumenti gratuiti, nessuna registrazione.",
    url: PAGE_URL,
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

export default function StrumentiIndexPage() {
  const crumbs = [
    { name: "Home", url: SITE_URL },
    { name: "Strumenti", url: PAGE_URL },
  ];
  return (
    <>
      <JsonLd data={breadcrumbListJsonLd(crumbs)} />

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Breadcrumbs items={crumbs} />

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {"Strumenti gratuiti"}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {
              "Calcolatori e verifiche pensati per chi emette scontrini elettronici. Sono gratuiti, non richiedono registrazione e funzionano direttamente nel browser."
            }
          </p>

          <div className="mt-10 space-y-4">
            {toolSlugs.map((slug) => {
              const t = tools[slug];
              return (
                <Link
                  key={slug}
                  href={`/strumenti/${slug}`}
                  className="bg-card hover:border-primary/40 block rounded-lg border p-5 transition-colors"
                >
                  <h2 className="text-lg font-semibold">{t.title}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {t.heroIntro}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="bg-muted/40 border-border mt-12 rounded-lg border p-5 text-center">
            <p className="text-sm font-semibold">
              {"Vuoi emettere scontrini con ScontrinoZero?"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {"30 giorni di prova gratuita, senza carta di credito."}
            </p>
            <Button asChild className="mt-3">
              <a href={appHref("/register")}>
                {"Crea l'account "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </article>
      </section>
    </>
  );
}
