import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Help Center | ScontrinoZero",
  description:
    "Indice iniziale del centro assistenza ScontrinoZero con categorie e titoli degli articoli da pubblicare.",
};

const HELP_BASE = process.env.NEXT_PUBLIC_HELP_HOSTNAME
  ? `https://${process.env.NEXT_PUBLIC_HELP_HOSTNAME}`
  : "/help";

interface HelpCategory {
  name: string;
  description: string;
  articles: readonly string[];
  href?: string;
}

const helpCategories: HelpCategory[] = [
  {
    name: "Partenza rapida",
    description: "Per iniziare in meno di 30 minuti.",
    articles: [
      "Cos'è ScontrinoZero e a chi è adatto",
      "Checklist iniziale: cosa serve prima di emettere il primo scontrino",
      "Prima configurazione passo-passo",
      "Come emettere il primo scontrino elettronico",
    ],
  },
  {
    name: "Fiscalizzazione e Agenzia Entrate",
    description: "Credenziali, collegamento e rinnovi.",
    articles: [
      "Come collegare ScontrinoZero all'Agenzia delle Entrate",
      "Credenziali Fisconline: recupero e verifica",
      "SPID: quando usarlo e perché va rinnovato",
      "Dove verificare i corrispettivi nel cassetto fiscale",
      "Errori comuni di accesso AdE e come risolverli",
    ],
  },
  {
    name: "Emissione e gestione scontrini",
    description: "Operatività quotidiana in cassa.",
    articles: [
      "Come emettere, condividere e ristampare uno scontrino",
      "Annullare uno scontrino: quando si può e come fare",
      "Chiusura giornaliera: è obbligatoria?",
      "Storico scontrini: filtri, ricerca ed esportazione",
    ],
  },
  {
    name: "Configurazione attività",
    description: "Impostazioni fiscali e personalizzazioni.",
    articles: [
      "Regime forfettario: configurazione IVA corretta",
      "Come gestire aliquote IVA, reparti e metodi di pagamento",
      "Personalizzare intestazione e dati dello scontrino",
      "Gestione operatori e permessi",
    ],
  },
  {
    name: "POS e normativa",
    description: "Obblighi 2026 e collegamento POS-RT.",
    articles: [
      "Collegamento POS-RT: chi è obbligato e scadenze",
      "Come registrare un POS nel portale Fatture e Corrispettivi",
      "Nuova normativa POS 2026: cosa cambia per gli esercenti",
    ],
  },
  {
    name: "Stampanti e hardware",
    description: "Stampa scontrini e dispositivi supportati.",
    articles: [
      "Quale stampante termica scegliere",
      "Configurare una stampante Bluetooth",
      "Risolvere problemi di stampa (connessione, taglio, formato)",
    ],
  },
  {
    name: "Integrazioni",
    description: "Connessioni con canali di vendita esterni.",
    articles: [
      "Integrazione con Shopify: panoramica e casi d'uso",
      "Integrazione con WooCommerce: setup base",
      "Collegare un registratore telematico esistente",
    ],
  },
  {
    name: "API per sviluppatori",
    description: "Integra l'emissione scontrini nel tuo gestionale o POS.",
    articles: [
      "Autenticazione e gestione chiavi API",
      "Endpoint: emissione, stato e annullamento scontrino",
      "Codici IVA, rate limit e gestione errori",
    ],
    href: `${HELP_BASE}/api`,
  },
  {
    name: "Abbonamento, fatture e supporto",
    description: "Piano, pagamenti e assistenza.",
    articles: [
      "Piani disponibili: Starter, Pro, Self-hosted",
      "Come passare da mensile ad annuale",
      "Dove trovare fatture e ricevute di pagamento",
      "Come contattare l'assistenza",
    ],
  },
];

export default function HelpHomePage() {
  return (
    <section className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3">
          <p className="text-primary text-sm font-semibold tracking-wide uppercase">
            Help Center
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Centro assistenza ScontrinoZero
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            Prima bozza della homepage del sottodominio help/docs: qui definiamo
            le categorie e i titoli degli articoli da produrre nelle prossime
            iterazioni.
          </p>
        </div>

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
                <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
                  {category.articles.map((article) => (
                    <li key={article}>{article}</li>
                  ))}
                </ul>
                {category.href && (
                  <Link
                    href={category.href}
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
    </section>
  );
}
