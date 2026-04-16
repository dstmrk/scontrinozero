import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Help Center | ScontrinoZero",
  description:
    "Guide, tutorial e risposte alle domande frequenti su ScontrinoZero: collegamento AdE, emissione scontrini, configurazione fiscale e molto altro.",
};

interface HelpArticle {
  title: string;
  href?: string;
}

interface HelpCategory {
  name: string;
  description: string;
  articles: readonly HelpArticle[];
  categoryHref?: string;
}

const featuredArticles: HelpArticle[] = [
  {
    title: "Prima configurazione passo-passo (onboarding completo)",
    href: "/help/prima-configurazione",
  },
  {
    title: "Come collegare ScontrinoZero all'Agenzia delle Entrate",
    href: "/help/come-collegare-ade",
  },
  {
    title: "Credenziali Fisconline: dove trovarle e come verificarle",
    href: "/help/credenziali-fisconline",
  },
  {
    title: "Come emettere il primo scontrino elettronico",
    href: "/help/primo-scontrino",
  },
  {
    title: "Errori comuni di accesso AdE e come risolverli",
    href: "/help/errori-ade",
  },
];

const helpCategories: HelpCategory[] = [
  {
    name: "Partenza rapida",
    description: "Per iniziare in meno di 30 minuti.",
    articles: [
      {
        title: "Prima configurazione passo-passo (onboarding completo)",
        href: "/help/prima-configurazione",
      },
      {
        title: "Come emettere il primo scontrino elettronico",
        href: "/help/primo-scontrino",
      },
      {
        title: "Come installare ScontrinoZero come app sul tuo dispositivo",
        href: "/help/installare-app",
      },
    ],
  },
  {
    name: "Fiscalizzazione e Agenzia Entrate",
    description: "Credenziali, collegamento e rinnovi.",
    articles: [
      {
        title: "Come collegare ScontrinoZero all'Agenzia delle Entrate",
        href: "/help/come-collegare-ade",
      },
      {
        title: "Credenziali Fisconline: dove trovarle e come verificarle",
        href: "/help/credenziali-fisconline",
      },
      { title: "Dove verificare i corrispettivi nel cassetto fiscale" },
      {
        title: "Errori comuni di accesso AdE e come risolverli",
        href: "/help/errori-ade",
      },
      {
        title: "Sicurezza e privacy: come proteggiamo le tue credenziali",
        href: "/help/sicurezza-credenziali",
      },
    ],
  },
  {
    name: "Emissione e gestione scontrini",
    description: "Operatività quotidiana in cassa.",
    articles: [
      {
        title: "Come emettere il primo scontrino elettronico",
        href: "/help/primo-scontrino",
      },
      {
        title: "Annullare uno scontrino: quando si può e come fare",
        href: "/help/annullare-scontrino",
      },
      { title: "Chiusura giornaliera: è obbligatoria?" },
      { title: "Storico scontrini: filtri, ricerca ed esportazione" },
    ],
  },
  {
    name: "Configurazione attività",
    description: "Impostazioni fiscali e personalizzazioni.",
    articles: [
      {
        title: "Regime forfettario: configurazione IVA corretta",
        href: "/help/regime-forfettario",
      },
      { title: "Come gestire aliquote IVA, reparti e metodi di pagamento" },
      { title: "Personalizzare intestazione e dati dello scontrino" },
      { title: "Gestione operatori e permessi" },
    ],
  },
  {
    name: "POS e normativa",
    description: "Obblighi 2026 e collegamento POS-RT.",
    articles: [
      { title: "Collegamento POS-RT: chi è obbligato e scadenze" },
      {
        title: "Come registrare un POS nel portale Fatture e Corrispettivi",
      },
      { title: "Nuova normativa POS 2026: cosa cambia per gli esercenti" },
    ],
  },
  {
    name: "Stampanti e hardware",
    description: "Stampa scontrini e dispositivi supportati.",
    articles: [
      { title: "Quale stampante termica scegliere" },
      { title: "Configurare una stampante Bluetooth" },
      {
        title: "Risolvere problemi di stampa (connessione, taglio, formato)",
      },
    ],
  },
  {
    name: "Integrazioni",
    description: "Connessioni con canali di vendita esterni.",
    articles: [
      { title: "Integrazione con Shopify: panoramica e casi d'uso" },
      { title: "Integrazione con WooCommerce: setup base" },
      { title: "Collegare un registratore telematico esistente" },
    ],
  },
  {
    name: "API per sviluppatori",
    description: "Integra l'emissione scontrini nel tuo gestionale o POS.",
    articles: [
      { title: "Autenticazione e gestione chiavi API" },
      { title: "Endpoint: emissione, stato e annullamento scontrino" },
      { title: "Codici IVA, rate limit e gestione errori" },
    ],
    categoryHref: "/help/api",
  },
  {
    name: "Abbonamento, fatture e supporto",
    description: "Piano, pagamenti e assistenza.",
    articles: [
      { title: "Piani disponibili: Starter, Pro e versione gratuita" },
      { title: "Come passare da mensile ad annuale" },
      { title: "Dove trovare fatture e ricevute di pagamento" },
      { title: "Come contattare l'assistenza" },
    ],
  },
];

export default function HelpHomePage() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-12">
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
              <li key={article.title}>
                {article.href ? (
                  <Link
                    href={article.href}
                    className="hover:bg-muted/50 flex items-center justify-between px-4 py-3 text-sm transition-colors"
                  >
                    <span>{article.title}</span>
                    <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground flex items-center justify-between px-4 py-3 text-sm">
                    <span>{article.title}</span>
                  </span>
                )}
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
                      <li
                        key={article.title}
                        className="flex items-start gap-2"
                      >
                        <span className="text-muted-foreground mt-0.5">›</span>
                        {article.href ? (
                          <Link
                            href={article.href}
                            className="text-primary hover:underline"
                          >
                            {article.title}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {article.title}
                          </span>
                        )}
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
