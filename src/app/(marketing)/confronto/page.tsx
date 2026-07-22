import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { appHref } from "@/lib/marketing-to-app-href";
import { Button } from "@/components/ui/button";
import {
  JsonLd,
  breadcrumbListJsonLd,
  faqPageJsonLd,
} from "@/components/json-ld";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { confrontoContent } from "@/lib/confronto/comparisons";
import { helpArticles } from "@/lib/help/articles";
import { formatDate } from "@/lib/utils";

const SITE_URL = "https://scontrinozero.it";
const PAGE_URL = `${SITE_URL}/confronto`;

export const metadata: Metadata = {
  title: confrontoContent.metaTitle,
  description: confrontoContent.metaDescription,
  openGraph: {
    title: confrontoContent.metaTitle,
    description: confrontoContent.metaDescription,
    url: PAGE_URL,
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

export default function ConfrontoPage() {
  const c = confrontoContent;
  const relatedArticles = c.relatedHelp
    .map((helpSlug) => helpArticles[helpSlug])
    .filter((a) => a !== undefined);
  const crumbs = [
    { name: "Home", url: SITE_URL },
    { name: "Confronto", url: PAGE_URL },
  ];

  return (
    <>
      <JsonLd data={breadcrumbListJsonLd(crumbs)} />
      {c.faq.length > 0 && <JsonLd data={faqPageJsonLd(c.faq)} />}

      <section className="px-4 py-16">
        <article className="mx-auto max-w-3xl">
          <Breadcrumbs items={crumbs} />

          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {c.title}
          </h1>
          <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
            {c.heroIntro}
          </p>

          <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <a href={appHref("/register")}>
                {"Prova ScontrinoZero gratis "}
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <span className="text-muted-foreground text-sm">
              {"30 giorni gratis · da €2,50/mese · nessuna carta richiesta"}
            </span>
          </div>

          {/* Categorie di alternative */}
          <h2 className="mt-12 text-2xl font-semibold">
            {"Le categorie di alternative"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {
              "Tre famiglie di soluzioni, ciascuna con un caso d'uso diverso. Vediamole una alla volta."
            }
          </p>
          <div className="mt-6 space-y-8">
            {c.categories.map((cat) => (
              <div key={cat.id} className="rounded-lg border p-5">
                <h3 className="text-lg font-semibold">{cat.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {cat.intro}
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">
                      {"Quando ha più senso questa strada"}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {cat.whenItFits.map((item) => (
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
                  <div>
                    <p className="text-primary text-sm font-medium">
                      {"Quando conviene ScontrinoZero"}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {cat.whenWeFit.map((item) => (
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
              </div>
            ))}
          </div>

          {/* Software comparabili */}
          <h2 className="mt-12 text-2xl font-semibold">
            {"Software comparabili per lo scontrino elettronico"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {c.saasIntro}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {"Servizio"}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {"Prezzo dichiarato"}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    {"Trial"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.saasCompetitors.map((s) => (
                  <tr key={s.url} className="align-top">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </a>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {s.displayUrl}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                        {s.notes}
                      </span>
                    </th>
                    <td className="text-muted-foreground px-4 py-3 text-sm">
                      {s.pricing}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-sm">
                      {s.trial}
                    </td>
                  </tr>
                ))}
                <tr className="bg-primary/5 align-top">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="text-primary font-semibold">
                      {"ScontrinoZero"}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {"scontrinozero.it"}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                      {
                        "Open source: lo installi gratis sul tuo computer o server. Pensato per lo smartphone, con la possibilità di installare l'app dal browser. Codice ispezionabile su GitHub."
                      }
                    </span>
                  </th>
                  <td className="text-primary px-4 py-3 text-sm font-semibold">
                    {"Starter 29,99 €/anno · Pro 49,99 €/anno"}
                    <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                      {"(€2,50/mese · €4,17/mese equivalenti)"}
                    </span>
                  </td>
                  <td className="text-primary px-4 py-3 text-sm font-semibold">
                    {"30 giorni, senza carta"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {"Dati rilevati dai siti pubblici il "}
            {formatDate(c.lastUpdated, "numeric", "Europe/Rome")}
            {
              ". Listini e funzionalità possono cambiare in qualsiasi momento: verifica direttamente sui siti ufficiali prima di scegliere."
            }
          </p>

          {/* Perché ScontrinoZero */}
          <h2 className="mt-12 text-2xl font-semibold">
            {"Cosa rende ScontrinoZero diverso"}
          </h2>
          <ul className="mt-4 space-y-2">
            {c.differentiators.map((item) => (
              <li
                key={item}
                className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
              >
                <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Quando ScontrinoZero NON è la scelta giusta */}
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="bg-primary/5 border-primary/20 rounded-lg border p-5">
              <h3 className="text-primary font-semibold">
                {"ScontrinoZero è la scelta giusta se…"}
              </h3>
              <ul className="mt-3 space-y-2">
                {c.ourPositioning.bestFor.map((item) => (
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
            <div className="bg-muted/40 rounded-lg border p-5">
              <h3 className="font-semibold">{"…meno indicato se invece…"}</h3>
              <ul className="mt-3 space-y-2">
                {c.ourPositioning.notBestFor.map((item) => (
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
          </div>

          {/* FAQ */}
          <h2 className="mt-12 text-2xl font-semibold">
            {"Domande frequenti"}
          </h2>
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
              <h2 className="mt-12 text-2xl font-semibold">
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
            <p className="text-sm font-semibold">{"Pronto a provare?"}</p>
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
