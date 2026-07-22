export interface HelpArticle {
  readonly slug: string;
  /** Etichetta breve usata in breadcrumb, card dell'hub e correlati. */
  readonly title: string;
  /** Titolo SEO completo per il tag <title> (il brand viene aggiunto dal template root). */
  readonly metaTitle: string;
  /** Descrizione SEO, riusata sia nei metadata di pagina sia nello structured data Article. */
  readonly description: string;
  /** Data ISO YYYY-MM-DD di prima pubblicazione (finisce in Article JSON-LD e sitemap). */
  readonly datePublished: string;
  /** Data ISO YYYY-MM-DD dell'ultima revisione sostanziale del page.tsx (>= datePublished).
   * Bump manuale a ogni modifica di contenuto — è il segnale di freshness per Google/AI. */
  readonly dateModified: string;
  readonly related: readonly [string, string, string];
}

export const helpArticles: Record<string, HelpArticle> = {
  "aliquote-iva": {
    slug: "aliquote-iva",
    datePublished: "2026-04-17",
    dateModified: "2026-07-13",
    title: "Aliquote IVA, catalogo e metodi di pagamento",
    metaTitle: "Come gestire aliquote IVA, catalogo e metodi di pagamento",
    description:
      "Guida alla configurazione delle aliquote IVA (4%, 5%, 10%, 22% e nature speciali), del catalogo prodotti e dei metodi di pagamento in ScontrinoZero.",
    related: ["regime-forfettario", "primo-scontrino", "annullare-scontrino"],
  },
  "annullare-scontrino": {
    slug: "annullare-scontrino",
    datePublished: "2026-04-11",
    dateModified: "2026-07-13",
    title: "Annullare uno scontrino: quando si può e come fare",
    metaTitle: "Annullare scontrino elettronico: come fare ed entro quando",
    description:
      "Entro quanto tempo si può annullare uno scontrino elettronico e come farlo da ScontrinoZero: la procedura, cosa succede sul portale AdE e quando emettere un reso invece dell'annullo.",
    related: [
      "primo-scontrino",
      "numero-documento-azzeramento",
      "storico-ed-esportazione",
    ],
  },
  "analytics-e-report": {
    slug: "analytics-e-report",
    datePublished: "2026-07-13",
    dateModified: "2026-07-13",
    title: "Analytics e report: ricavi, scontrini e prodotti",
    metaTitle: "Analytics e report: ricavi, scontrini e prodotti più venduti",
    description:
      "Come leggere il pannello Analytics: i KPI (ricavi, scontrini emessi, scontrino medio e annullati), i grafici e il selettore di periodo. I grafici avanzati e l'export CSV sono sul piano Pro.",
    related: ["storico-ed-esportazione", "piani-e-prezzi", "cassetto-fiscale"],
  },
  api: {
    slug: "api",
    datePublished: "2026-04-02",
    dateModified: "2026-06-26",
    title: "API per sviluppatori",
    metaTitle: "API per sviluppatori",
    description:
      "Documentazione completa delle API REST di ScontrinoZero: autenticazione, endpoint, esempi curl e riferimenti tecnici.",
    related: [
      "primo-scontrino",
      "sicurezza-credenziali",
      "contatto-assistenza",
    ],
  },
  "cambio-piano": {
    slug: "cambio-piano",
    datePublished: "2026-04-20",
    dateModified: "2026-07-13",
    title: "Come passare da mensile ad annuale",
    metaTitle: "Come passare da mensile ad annuale",
    description:
      "Guida per cambiare il piano ScontrinoZero da mensile ad annuale e risparmiare fino al 54%. Istruzioni passo-passo per la modifica dell'abbonamento.",
    related: ["piani-e-prezzi", "fatture-e-ricevute", "contatto-assistenza"],
  },
  "cassetto-fiscale": {
    slug: "cassetto-fiscale",
    datePublished: "2026-04-17",
    dateModified: "2026-06-21",
    title: "Verificare i corrispettivi nel cassetto fiscale",
    metaTitle: "Dove verificare i corrispettivi nel cassetto fiscale",
    description:
      "Scopri come accedere al cassetto fiscale dell'Agenzia delle Entrate per verificare che i tuoi scontrini siano stati trasmessi correttamente.",
    related: ["storico-ed-esportazione", "errori-ade", "primo-scontrino"],
  },
  "chiusura-giornaliera": {
    slug: "chiusura-giornaliera",
    datePublished: "2026-04-17",
    dateModified: "2026-06-21",
    title: "Chiusura giornaliera: è obbligatoria?",
    metaTitle: "Chiusura giornaliera: è obbligatoria?",
    description:
      "Con ScontrinoZero non devi fare nessuna chiusura giornaliera. Scopri perché il Documento Commerciale Online funziona diversamente dal registratore telematico fisico.",
    related: ["cassetto-fiscale", "storico-ed-esportazione", "primo-scontrino"],
  },
  "come-collegare-ade": {
    slug: "come-collegare-ade",
    datePublished: "2026-04-11",
    dateModified: "2026-07-15",
    title: "Collegare ScontrinoZero all'Agenzia delle Entrate",
    metaTitle: "Come collegare ScontrinoZero all'Agenzia delle Entrate",
    description:
      "Guida passo-passo per collegare ScontrinoZero al portale Fatture e Corrispettivi dell'Agenzia delle Entrate con le credenziali Fisconline o, in alternativa, con la CIE tramite l'app CIE ID.",
    related: ["credenziali-fisconline", "errori-ade", "primo-scontrino"],
  },
  "collegare-ade-con-cie": {
    slug: "collegare-ade-con-cie",
    datePublished: "2026-07-15",
    dateModified: "2026-07-15",
    title: "Collegare l'AdE con CIE (app CIE ID)",
    metaTitle: "Collegare ScontrinoZero all'AdE con CIE (app CIE ID)",
    description:
      "Collegare ScontrinoZero all'Agenzia delle Entrate con la CIE tramite l'app CIE ID: email e password dell'app e approvazione della notifica push, senza credenziali Fisconline.",
    related: ["come-collegare-ade", "credenziali-fisconline", "errori-ade"],
  },
  "contatto-assistenza": {
    slug: "contatto-assistenza",
    datePublished: "2026-04-20",
    dateModified: "2026-07-13",
    title: "Come contattare l'assistenza",
    metaTitle: "Come contattare l'assistenza",
    description:
      "Canali di supporto disponibili, tempi di risposta e come segnalare un problema a ScontrinoZero.",
    related: ["errori-ade", "sicurezza-credenziali", "piani-e-prezzi"],
  },
  "credenziali-fisconline": {
    slug: "credenziali-fisconline",
    datePublished: "2026-04-11",
    dateModified: "2026-07-13",
    title: "Credenziali Fisconline: dove trovarle e verificarle",
    metaTitle: "Credenziali Fisconline: dove trovarle e come verificarle",
    description:
      "Guida completa a Fisconline: cos'è, chi può ottenere le credenziali, come verificarle e cosa fare se la password è scaduta.",
    related: ["come-collegare-ade", "sicurezza-credenziali", "errori-ade"],
  },
  "errori-ade": {
    slug: "errori-ade",
    datePublished: "2026-04-16",
    dateModified: "2026-07-15",
    title: "Errori comuni di accesso AdE e come risolverli",
    metaTitle: "Password AdE scaduta o accesso bloccato: come risolvere",
    description:
      "Password Fisconline scaduta o bloccata, credenziali errate, portale AdE non disponibile: cosa significa ogni errore di accesso all'Agenzia delle Entrate e come ripristinare l'accesso.",
    related: [
      "come-collegare-ade",
      "credenziali-fisconline",
      "sicurezza-credenziali",
    ],
  },
  "fatture-e-ricevute": {
    slug: "fatture-e-ricevute",
    datePublished: "2026-04-20",
    dateModified: "2026-06-21",
    title: "Dove trovare fatture e ricevute di pagamento",
    metaTitle: "Dove trovare fatture e ricevute di pagamento",
    description:
      "Come scaricare le ricevute e le fatture del tuo abbonamento ScontrinoZero per la contabilità e il commercialista.",
    related: ["cambio-piano", "piani-e-prezzi", "contatto-assistenza"],
  },
  "installare-app": {
    slug: "installare-app",
    datePublished: "2026-04-16",
    dateModified: "2026-06-21",
    title: "Installare ScontrinoZero come app sul dispositivo",
    metaTitle: "Come installare ScontrinoZero come app sul tuo dispositivo",
    description:
      "Installa ScontrinoZero come app PWA su iPhone, Android e desktop: istruzioni passo-passo per iOS (Safari), Android (Chrome) e computer. Accesso diretto dalla schermata home.",
    related: ["prima-configurazione", "primo-scontrino", "piani-e-prezzi"],
  },
  "intestazione-scontrino": {
    slug: "intestazione-scontrino",
    datePublished: "2026-04-20",
    dateModified: "2026-07-13",
    title: "Personalizzare intestazione e dati dello scontrino",
    metaTitle: "Personalizzare intestazione e dati dello scontrino",
    description:
      "Come modificare la ragione sociale, l'indirizzo e i dati fiscali che appaiono sull'intestazione dello scontrino emesso da ScontrinoZero.",
    related: ["prima-configurazione", "come-collegare-ade", "primo-scontrino"],
  },
  "normativa-pos-2026": {
    slug: "normativa-pos-2026",
    datePublished: "2026-04-17",
    dateModified: "2026-06-21",
    title: "Collegamento POS-cassa 2026: cosa cambia",
    metaTitle: "Normativa POS 2026: obbligo, scadenze e sanzioni POS-cassa",
    description:
      "Normativa POS 2026 (Legge 207/2024): chi deve collegare POS e cassa, la scadenza del 20 aprile 2026 per la prima comunicazione, le sanzioni e come metterti in regola col Documento Commerciale Online.",
    related: ["pos-rt-obbligo", "chiusura-giornaliera", "regime-forfettario"],
  },
  "numero-documento-azzeramento": {
    slug: "numero-documento-azzeramento",
    datePublished: "2026-07-12",
    dateModified: "2026-07-13",
    title: "Numero documento e azzeramento sullo scontrino",
    metaTitle: "Numero azzeramento e numero documento scontrino: cosa sono",
    description:
      "Cosa significano il numero documento e il numero di azzeramento stampati sullo scontrino (formato 0051-0023), dove trovarli e come cambia la numerazione con il documento commerciale online.",
    related: [
      "chiusura-giornaliera",
      "annullare-scontrino",
      "storico-ed-esportazione",
    ],
  },
  "piani-e-prezzi": {
    slug: "piani-e-prezzi",
    datePublished: "2026-04-17",
    dateModified: "2026-07-15",
    title: "Piani disponibili: Starter, Pro e self-hosted",
    metaTitle: "Piani disponibili: Starter, Pro e self-hosted gratuito",
    description:
      "Scopri le differenze tra i piani Starter, Pro e la versione self-hosted gratuita di ScontrinoZero. Prezzi, feature e come scegliere il piano giusto.",
    related: ["analytics-e-report", "fatture-e-ricevute", "cambio-piano"],
  },
  "pos-rt-obbligo": {
    slug: "pos-rt-obbligo",
    datePublished: "2026-04-20",
    dateModified: "2026-06-21",
    title: "Collegamento POS-RT: obbligo e scadenze 2026",
    metaTitle: "Collegamento POS-RT: chi è obbligato e scadenze 2026",
    description:
      "Obbligo di collegare il POS al registratore telematico dal 2026: fonte normativa, scadenze, sanzioni e come fare l'associazione POS-DCO sul portale AdE.",
    related: ["normativa-pos-2026", "come-collegare-ade", "primo-scontrino"],
  },
  "prima-configurazione": {
    slug: "prima-configurazione",
    datePublished: "2026-04-16",
    dateModified: "2026-07-15",
    title: "Prima configurazione passo-passo",
    metaTitle: "Prima configurazione passo-passo",
    description:
      "Guida all'onboarding di ScontrinoZero: crea l'account, inserisci i dati dell'attività e collega le credenziali Fisconline per iniziare a emettere scontrini elettronici.",
    related: ["come-collegare-ade", "primo-scontrino", "installare-app"],
  },
  "presenta-un-amico": {
    slug: "presenta-un-amico",
    datePublished: "2026-06-26",
    dateModified: "2026-07-13",
    title: "Presenta un amico: come funziona il bonus referral",
    metaTitle:
      "Presenta un amico: bonus referral e quando arriva il mese gratis",
    description:
      "Come funziona Presenta un amico: il presentato ottiene subito 1 mese di prova in più, il presentatore 1 mese sul piano quando l'invitato collega la P.IVA. Dove trovare e condividere il codice.",
    related: ["piani-e-prezzi", "cambio-piano", "contatto-assistenza"],
  },
  "primo-scontrino": {
    slug: "primo-scontrino",
    datePublished: "2026-04-11",
    dateModified: "2026-07-15",
    title: "Come emettere il primo scontrino elettronico",
    metaTitle: "Come emettere il primo scontrino elettronico",
    description:
      "Guida passo-passo per emettere il primo scontrino elettronico con ScontrinoZero: apertura cassa, aggiunta prodotti, selezione pagamento e trasmissione AdE.",
    related: [
      "come-collegare-ade",
      "annullare-scontrino",
      "regime-forfettario",
    ],
  },
  "regime-forfettario": {
    slug: "regime-forfettario",
    datePublished: "2026-04-11",
    dateModified: "2026-07-12",
    title: "Regime forfettario: configurazione IVA corretta",
    metaTitle: "Codice IVA regime forfettario: N2 scontrino, N2.2 fattura",
    description:
      "Il codice IVA del regime forfettario è natura N2 sullo scontrino elettronico e N2.2 in fattura, con dicitura art. 1 commi 54-89 L. 190/2014: ecco come configurarlo in ScontrinoZero senza errori.",
    related: ["aliquote-iva", "primo-scontrino", "annullare-scontrino"],
  },
  "registrare-pos-portale-ade": {
    slug: "registrare-pos-portale-ade",
    datePublished: "2026-05-21",
    dateModified: "2026-06-21",
    title: "Registrare un POS nel portale Fatture e Corrispettivi",
    metaTitle: "Come registrare un POS nel portale Fatture e Corrispettivi",
    description:
      "Guida passo-passo al Censimento POS sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate: prerequisiti, percorso nel portale, differenza fra POS bancario e POS-RT, errori comuni.",
    related: ["pos-rt-obbligo", "normativa-pos-2026", "come-collegare-ade"],
  },
  "sicurezza-credenziali": {
    slug: "sicurezza-credenziali",
    datePublished: "2026-04-16",
    dateModified: "2026-07-15",
    title: "Sicurezza e privacy delle credenziali",
    metaTitle: "Sicurezza e privacy: come proteggiamo le tue credenziali",
    description:
      "Come ScontrinoZero protegge le credenziali Fisconline: cifratura AES-256-GCM at-rest, chiave fuori dal database, chi può accedere ai tuoi dati e come revocare l'accesso.",
    related: ["credenziali-fisconline", "errori-ade", "come-collegare-ade"],
  },
  "stampare-scontrino-termica": {
    slug: "stampare-scontrino-termica",
    datePublished: "2026-05-21",
    dateModified: "2026-07-13",
    title: "Stampare lo scontrino su carta termica",
    metaTitle: "Come stampare lo scontrino su carta termica",
    description:
      "Guida pratica alla scelta di una stampante termica per scontrini (58 o 80 mm), all'abbinamento Bluetooth da Android, iPhone e computer e alla risoluzione dei problemi più comuni.",
    related: [
      "primo-scontrino",
      "intestazione-scontrino",
      "storico-ed-esportazione",
    ],
  },
  "storico-ed-esportazione": {
    slug: "storico-ed-esportazione",
    datePublished: "2026-04-17",
    dateModified: "2026-07-13",
    title: "Storico scontrini: filtri, ricerca ed esportazione",
    metaTitle: "Storico scontrini: filtri, ricerca ed esportazione",
    description:
      "Come navigare lo storico degli scontrini in ScontrinoZero, usare i filtri di ricerca e ricondividere il PDF dei singoli scontrini. L'export CSV è disponibile sul piano Pro.",
    related: ["annullare-scontrino", "cassetto-fiscale", "analytics-e-report"],
  },
};

/**
 * Tutti gli slug degli articoli help, in ordine di inserimento. Unica fonte di
 * verità per la sitemap (evita il drift dell'elenco hardcoded) e per qualunque
 * iterazione sugli articoli.
 */
export const helpSlugs: readonly string[] = Object.keys(helpArticles);

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
