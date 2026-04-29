export interface HelpArticle {
  readonly slug: string;
  readonly title: string;
  readonly related: readonly [string, string, string];
}

export const helpArticles: Record<string, HelpArticle> = {
  "aliquote-iva": {
    slug: "aliquote-iva",
    title: "Aliquote IVA, catalogo e metodi di pagamento",
    related: ["regime-forfettario", "primo-scontrino", "annullare-scontrino"],
  },
  "annullare-scontrino": {
    slug: "annullare-scontrino",
    title: "Annullare uno scontrino: quando si può e come fare",
    related: [
      "primo-scontrino",
      "storico-ed-esportazione",
      "come-collegare-ade",
    ],
  },
  api: {
    slug: "api",
    title: "API per sviluppatori",
    related: [
      "primo-scontrino",
      "sicurezza-credenziali",
      "contatto-assistenza",
    ],
  },
  "cambio-piano": {
    slug: "cambio-piano",
    title: "Come passare da mensile ad annuale",
    related: ["piani-e-prezzi", "fatture-e-ricevute", "contatto-assistenza"],
  },
  "cassetto-fiscale": {
    slug: "cassetto-fiscale",
    title: "Verificare i corrispettivi nel cassetto fiscale",
    related: ["storico-ed-esportazione", "errori-ade", "primo-scontrino"],
  },
  "chiusura-giornaliera": {
    slug: "chiusura-giornaliera",
    title: "Chiusura giornaliera: è obbligatoria?",
    related: ["cassetto-fiscale", "storico-ed-esportazione", "primo-scontrino"],
  },
  "come-collegare-ade": {
    slug: "come-collegare-ade",
    title: "Collegare ScontrinoZero all'Agenzia delle Entrate",
    related: ["credenziali-fisconline", "errori-ade", "primo-scontrino"],
  },
  "contatto-assistenza": {
    slug: "contatto-assistenza",
    title: "Come contattare l'assistenza",
    related: ["errori-ade", "sicurezza-credenziali", "piani-e-prezzi"],
  },
  "credenziali-fisconline": {
    slug: "credenziali-fisconline",
    title: "Credenziali Fisconline: dove trovarle e verificarle",
    related: ["come-collegare-ade", "sicurezza-credenziali", "errori-ade"],
  },
  "errori-ade": {
    slug: "errori-ade",
    title: "Errori comuni di accesso AdE e come risolverli",
    related: [
      "come-collegare-ade",
      "credenziali-fisconline",
      "sicurezza-credenziali",
    ],
  },
  "fatture-e-ricevute": {
    slug: "fatture-e-ricevute",
    title: "Dove trovare fatture e ricevute di pagamento",
    related: ["cambio-piano", "piani-e-prezzi", "contatto-assistenza"],
  },
  "installare-app": {
    slug: "installare-app",
    title: "Installare ScontrinoZero come app sul dispositivo",
    related: ["prima-configurazione", "primo-scontrino", "piani-e-prezzi"],
  },
  "intestazione-scontrino": {
    slug: "intestazione-scontrino",
    title: "Personalizzare intestazione e dati dello scontrino",
    related: ["prima-configurazione", "come-collegare-ade", "primo-scontrino"],
  },
  "normativa-pos-2026": {
    slug: "normativa-pos-2026",
    title: "Collegamento POS-cassa 2026: cosa cambia",
    related: ["pos-rt-obbligo", "chiusura-giornaliera", "regime-forfettario"],
  },
  "piani-e-prezzi": {
    slug: "piani-e-prezzi",
    title: "Piani disponibili: Starter, Pro e self-hosted",
    related: ["prima-configurazione", "fatture-e-ricevute", "cambio-piano"],
  },
  "pos-rt-obbligo": {
    slug: "pos-rt-obbligo",
    title: "Collegamento POS-RT: obbligo e scadenze 2026",
    related: ["normativa-pos-2026", "come-collegare-ade", "primo-scontrino"],
  },
  "prima-configurazione": {
    slug: "prima-configurazione",
    title: "Prima configurazione passo-passo",
    related: ["come-collegare-ade", "primo-scontrino", "installare-app"],
  },
  "primo-scontrino": {
    slug: "primo-scontrino",
    title: "Come emettere il primo scontrino elettronico",
    related: [
      "come-collegare-ade",
      "annullare-scontrino",
      "regime-forfettario",
    ],
  },
  "regime-forfettario": {
    slug: "regime-forfettario",
    title: "Regime forfettario: configurazione IVA corretta",
    related: ["aliquote-iva", "primo-scontrino", "annullare-scontrino"],
  },
  "sicurezza-credenziali": {
    slug: "sicurezza-credenziali",
    title: "Sicurezza e privacy delle credenziali",
    related: ["credenziali-fisconline", "errori-ade", "come-collegare-ade"],
  },
  "storico-ed-esportazione": {
    slug: "storico-ed-esportazione",
    title: "Storico scontrini: filtri, ricerca ed esportazione",
    related: ["annullare-scontrino", "cassetto-fiscale", "piani-e-prezzi"],
  },
};

export function getHelpArticle(slug: string): HelpArticle {
  const article = helpArticles[slug];
  if (!article) {
    throw new Error(`Unknown help article slug: ${slug}`);
  }
  return article;
}

export function getRelatedArticles(slug: string): HelpArticle[] {
  const article = getHelpArticle(slug);
  return article.related.map((relSlug) => getHelpArticle(relSlug));
}
