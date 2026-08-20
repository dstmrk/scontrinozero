import { getHelpArticle } from "./articles";

/**
 * Sezione interna a un articolo: la voce dell'hub punta a un'ancora, non
 * all'articolo intero, quindi porta la propria etichetta (id e label vivono
 * insieme perché non hanno senso separati).
 */
export interface HubSection {
  readonly id: string;
  readonly label: string;
}

/**
 * Riferimento a un articolo nell'hub `/help`. Contiene solo lo slug: titolo e
 * href si derivano dal registry `helpArticles`, unica fonte di verità.
 */
export interface HubArticleRef {
  readonly slug: string;
  readonly section?: HubSection;
}

export interface HubCategory {
  readonly name: string;
  readonly description: string;
  readonly articles: readonly HubArticleRef[];
  /** Articolo "indice" della categoria, linkato in fondo alla card. */
  readonly categoryHref?: string;
}

export interface HubArticleLink {
  readonly title: string;
  readonly href: string;
}

/**
 * Risolve un riferimento in titolo + href leggendo il registry. Uno slug
 * inesistente fa throw (`getHelpArticle`) e rompe il build della pagina: un
 * refuso non arriva mai in produzione come link morto.
 */
export function resolveHubArticle(ref: HubArticleRef): HubArticleLink {
  const article = getHelpArticle(ref.slug);
  if (ref.section) {
    return {
      title: ref.section.label,
      href: `/help/${article.slug}#${ref.section.id}`,
    };
  }
  return { title: article.title, href: `/help/${article.slug}` };
}

/** Articoli in evidenza ("Articoli più letti") in cima all'hub. */
export const helpHubFeaturedSlugs: readonly string[] = [
  "prima-configurazione",
  "come-collegare-ade",
  "credenziali-fisconline",
  "primo-scontrino",
  "errori-ade",
];

/**
 * Tassonomia dell'hub `/help`. Ogni slug del registry deve comparire qui:
 * `hub-categories.test.ts` fallisce sull'articolo orfano.
 */
export const helpHubCategories: readonly HubCategory[] = [
  {
    name: "Partenza rapida",
    description: "Per iniziare in meno di 30 minuti.",
    articles: [
      { slug: "prima-configurazione" },
      { slug: "primo-scontrino" },
      { slug: "installare-app" },
    ],
  },
  {
    name: "Configurazione attività",
    description: "Impostazioni fiscali e personalizzazioni.",
    articles: [
      { slug: "regime-forfettario" },
      { slug: "aliquote-iva" },
      { slug: "intestazione-scontrino" },
      { slug: "messaggio-personalizzato-scontrino" },
    ],
  },
  {
    name: "Collegamento Agenzia Entrate",
    description: "Credenziali Fisconline o CIE e troubleshooting accesso.",
    articles: [
      { slug: "come-collegare-ade" },
      { slug: "collegare-ade-con-cie" },
      { slug: "credenziali-fisconline" },
      { slug: "errori-ade" },
    ],
  },
  {
    name: "Sicurezza e cassetto fiscale",
    description: "Verifica corrispettivi e protezione credenziali.",
    articles: [{ slug: "cassetto-fiscale" }, { slug: "sicurezza-credenziali" }],
  },
  {
    name: "Emissione e gestione scontrini",
    description: "Operatività quotidiana in cassa.",
    articles: [
      { slug: "primo-scontrino" },
      { slug: "metodi-di-pagamento" },
      { slug: "annullare-scontrino" },
      { slug: "chiusura-giornaliera" },
      { slug: "storico-ed-esportazione" },
      { slug: "analytics-e-report" },
      { slug: "stampare-scontrino-termica" },
      { slug: "numero-documento-azzeramento" },
    ],
  },
  {
    name: "Abbonamento, fatture e supporto",
    description: "Piano, pagamenti e assistenza.",
    articles: [
      { slug: "piani-e-prezzi" },
      { slug: "presenta-un-amico" },
      { slug: "cambio-piano" },
      { slug: "fatture-e-ricevute" },
      { slug: "contatto-assistenza" },
    ],
  },
  {
    name: "POS e normativa",
    description: "Obblighi 2026 e collegamento POS-RT.",
    articles: [
      { slug: "pos-rt-obbligo" },
      { slug: "registrare-pos-portale-ade" },
      { slug: "normativa-pos-2026" },
    ],
  },
  {
    name: "API per sviluppatori",
    description:
      "Solo per chi integra ScontrinoZero da un gestionale o un POS. Se sei un commerciante, parti da Partenza rapida.",
    articles: [
      {
        slug: "api",
        section: {
          id: "autenticazione",
          label: "Autenticazione e gestione chiavi API",
        },
      },
      {
        slug: "api",
        section: {
          id: "endpoint",
          label: "Endpoint: emissione, stato e annullamento scontrino",
        },
      },
      {
        slug: "api",
        section: {
          id: "codici-iva",
          label: "Codici IVA, rate limit e gestione errori",
        },
      },
    ],
    categoryHref: "/help/api",
  },
];
