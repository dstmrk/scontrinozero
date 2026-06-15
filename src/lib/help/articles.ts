export interface HelpArticle {
  readonly slug: string;
  /** Etichetta breve usata in breadcrumb, card dell'hub e correlati. */
  readonly title: string;
  /** Titolo SEO completo per il tag <title> (il brand viene aggiunto dal template root). */
  readonly metaTitle: string;
  /** Descrizione SEO, riusata sia nei metadata di pagina sia nello structured data Article. */
  readonly description: string;
  readonly related: readonly [string, string, string];
}

/**
 * Data condivisa di "ultima revisione" del centro assistenza. Gli articoli help
 * sono documentazione viva, allineata alla versione corrente del prodotto: non
 * tracciamo una data di pubblicazione per-articolo, quindi usiamo un'unica data
 * di revisione come `datePublished`/`dateModified` dello structured data Article.
 * Aggiornarla quando si fa una revisione complessiva dei contenuti help.
 */
export const HELP_REVIEWED_DATE = "2026-06-15";

export const helpArticles: Record<string, HelpArticle> = {
  "aliquote-iva": {
    slug: "aliquote-iva",
    title: "Aliquote IVA, catalogo e metodi di pagamento",
    metaTitle: "Come gestire aliquote IVA, catalogo e metodi di pagamento",
    description:
      "Guida alla configurazione delle aliquote IVA (4%, 5%, 10%, 22% e nature speciali), del catalogo prodotti e dei metodi di pagamento in ScontrinoZero.",
    related: ["regime-forfettario", "primo-scontrino", "annullare-scontrino"],
  },
  "annullare-scontrino": {
    slug: "annullare-scontrino",
    title: "Annullare uno scontrino: quando si può e come fare",
    metaTitle: "Annullare uno scontrino: quando si può e come fare",
    description:
      "Scopri quando è possibile annullare uno scontrino elettronico, come farlo da ScontrinoZero e cosa succede sul portale dell'Agenzia delle Entrate.",
    related: [
      "primo-scontrino",
      "storico-ed-esportazione",
      "come-collegare-ade",
    ],
  },
  api: {
    slug: "api",
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
    title: "Come passare da mensile ad annuale",
    metaTitle: "Come passare da mensile ad annuale",
    description:
      "Guida per cambiare il piano ScontrinoZero da mensile ad annuale e risparmiare fino al 54%. Istruzioni passo-passo per la modifica dell'abbonamento.",
    related: ["piani-e-prezzi", "fatture-e-ricevute", "contatto-assistenza"],
  },
  "cassetto-fiscale": {
    slug: "cassetto-fiscale",
    title: "Verificare i corrispettivi nel cassetto fiscale",
    metaTitle: "Dove verificare i corrispettivi nel cassetto fiscale",
    description:
      "Scopri come accedere al cassetto fiscale dell'Agenzia delle Entrate per verificare che i tuoi scontrini siano stati trasmessi correttamente.",
    related: ["storico-ed-esportazione", "errori-ade", "primo-scontrino"],
  },
  "chiusura-giornaliera": {
    slug: "chiusura-giornaliera",
    title: "Chiusura giornaliera: è obbligatoria?",
    metaTitle: "Chiusura giornaliera: è obbligatoria?",
    description:
      "Con ScontrinoZero non devi fare nessuna chiusura giornaliera. Scopri perché il Documento Commerciale Online funziona diversamente dal registratore telematico fisico.",
    related: ["cassetto-fiscale", "storico-ed-esportazione", "primo-scontrino"],
  },
  "come-collegare-ade": {
    slug: "come-collegare-ade",
    title: "Collegare ScontrinoZero all'Agenzia delle Entrate",
    metaTitle: "Come collegare ScontrinoZero all'Agenzia delle Entrate",
    description:
      "Guida passo-passo per collegare ScontrinoZero al portale Fatture e Corrispettivi dell'Agenzia delle Entrate tramite credenziali Fisconline.",
    related: ["credenziali-fisconline", "errori-ade", "primo-scontrino"],
  },
  "contatto-assistenza": {
    slug: "contatto-assistenza",
    title: "Come contattare l'assistenza",
    metaTitle: "Come contattare l'assistenza",
    description:
      "Canali di supporto disponibili, tempi di risposta e come segnalare un problema a ScontrinoZero.",
    related: ["errori-ade", "sicurezza-credenziali", "piani-e-prezzi"],
  },
  "credenziali-fisconline": {
    slug: "credenziali-fisconline",
    title: "Credenziali Fisconline: dove trovarle e verificarle",
    metaTitle: "Credenziali Fisconline: dove trovarle e come verificarle",
    description:
      "Guida completa a Fisconline: cos'è, chi può ottenere le credenziali, come verificarle e cosa fare se la password è scaduta.",
    related: ["come-collegare-ade", "sicurezza-credenziali", "errori-ade"],
  },
  "errori-ade": {
    slug: "errori-ade",
    title: "Errori comuni di accesso AdE e come risolverli",
    metaTitle: "Errori comuni di accesso AdE e come risolverli",
    description:
      "Guida alla risoluzione degli errori più frequenti nel collegamento con l'Agenzia delle Entrate: password scaduta, credenziali errate, password bloccata, portale non disponibile e scontrino rifiutato in fase di emissione.",
    related: [
      "come-collegare-ade",
      "credenziali-fisconline",
      "sicurezza-credenziali",
    ],
  },
  "fatture-e-ricevute": {
    slug: "fatture-e-ricevute",
    title: "Dove trovare fatture e ricevute di pagamento",
    metaTitle: "Dove trovare fatture e ricevute di pagamento",
    description:
      "Come scaricare le ricevute e le fatture del tuo abbonamento ScontrinoZero per la contabilità e il commercialista.",
    related: ["cambio-piano", "piani-e-prezzi", "contatto-assistenza"],
  },
  "installare-app": {
    slug: "installare-app",
    title: "Installare ScontrinoZero come app sul dispositivo",
    metaTitle: "Come installare ScontrinoZero come app sul tuo dispositivo",
    description:
      "Installa ScontrinoZero come app PWA su iPhone, Android e desktop: istruzioni passo-passo per iOS (Safari), Android (Chrome) e computer. Accesso diretto dalla schermata home.",
    related: ["prima-configurazione", "primo-scontrino", "piani-e-prezzi"],
  },
  "intestazione-scontrino": {
    slug: "intestazione-scontrino",
    title: "Personalizzare intestazione e dati dello scontrino",
    metaTitle: "Personalizzare intestazione e dati dello scontrino",
    description:
      "Come modificare la ragione sociale, l'indirizzo e i dati fiscali che appaiono sull'intestazione dello scontrino emesso da ScontrinoZero.",
    related: ["prima-configurazione", "come-collegare-ade", "primo-scontrino"],
  },
  "normativa-pos-2026": {
    slug: "normativa-pos-2026",
    title: "Collegamento POS-cassa 2026: cosa cambia",
    metaTitle:
      "Normativa POS 2026: obbligo, scadenze e sanzioni del collegamento POS-cassa",
    description:
      "Normativa POS 2026 (Legge 207/2024): chi è obbligato a collegare il POS al sistema di cassa, scadenze, sanzioni e come metterti in regola con il Documento Commerciale Online.",
    related: ["pos-rt-obbligo", "chiusura-giornaliera", "regime-forfettario"],
  },
  "piani-e-prezzi": {
    slug: "piani-e-prezzi",
    title: "Piani disponibili: Starter, Pro e self-hosted",
    metaTitle: "Piani disponibili: Starter, Pro e self-hosted gratuito",
    description:
      "Scopri le differenze tra i piani Starter, Pro e la versione self-hosted gratuita di ScontrinoZero. Prezzi, feature e come scegliere il piano giusto.",
    related: ["prima-configurazione", "fatture-e-ricevute", "cambio-piano"],
  },
  "pos-rt-obbligo": {
    slug: "pos-rt-obbligo",
    title: "Collegamento POS-RT: obbligo e scadenze 2026",
    metaTitle: "Collegamento POS-RT: chi è obbligato e scadenze 2026",
    description:
      "Tutto sull'obbligo di collegare il POS al registratore telematico dal 2026: fonte normativa, scadenze, sanzioni e come si effettua l'associazione POS-DCO sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate.",
    related: ["normativa-pos-2026", "come-collegare-ade", "primo-scontrino"],
  },
  "prima-configurazione": {
    slug: "prima-configurazione",
    title: "Prima configurazione passo-passo",
    metaTitle: "Prima configurazione passo-passo",
    description:
      "Guida all'onboarding di ScontrinoZero: crea l'account, inserisci i dati dell'attività e collega le credenziali Fisconline per iniziare a emettere scontrini elettronici.",
    related: ["come-collegare-ade", "primo-scontrino", "installare-app"],
  },
  "primo-scontrino": {
    slug: "primo-scontrino",
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
    title: "Regime forfettario: configurazione IVA corretta",
    metaTitle:
      "Codice e natura IVA del regime forfettario (N2/N2.2) sullo scontrino",
    description:
      "Qual è il codice IVA del regime forfettario sullo scontrino: natura N2 sul documento commerciale (N2.2 in fattura), dicitura di esenzione e come configurarlo in ScontrinoZero senza errori.",
    related: ["aliquote-iva", "primo-scontrino", "annullare-scontrino"],
  },
  "registrare-pos-portale-ade": {
    slug: "registrare-pos-portale-ade",
    title: "Registrare un POS nel portale Fatture e Corrispettivi",
    metaTitle: "Come registrare un POS nel portale Fatture e Corrispettivi",
    description:
      "Guida passo-passo al Censimento POS sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate: prerequisiti, percorso nel portale, differenza fra POS bancario e POS-RT, errori comuni.",
    related: ["pos-rt-obbligo", "normativa-pos-2026", "come-collegare-ade"],
  },
  "sicurezza-credenziali": {
    slug: "sicurezza-credenziali",
    title: "Sicurezza e privacy delle credenziali",
    metaTitle: "Sicurezza e privacy: come proteggiamo le tue credenziali",
    description:
      "Come ScontrinoZero protegge le credenziali Fisconline: cifratura AES-256-GCM at-rest, chiave fuori dal database, chi può accedere ai tuoi dati e come revocare l'accesso.",
    related: ["credenziali-fisconline", "errori-ade", "come-collegare-ade"],
  },
  "stampare-scontrino-termica": {
    slug: "stampare-scontrino-termica",
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
    title: "Storico scontrini: filtri, ricerca ed esportazione",
    metaTitle: "Storico scontrini: filtri, ricerca ed esportazione",
    description:
      "Come navigare lo storico degli scontrini in ScontrinoZero, usare i filtri di ricerca e ricondividere il PDF dei singoli scontrini. L'export CSV è disponibile sul piano Pro.",
    related: ["annullare-scontrino", "cassetto-fiscale", "piani-e-prezzi"],
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
