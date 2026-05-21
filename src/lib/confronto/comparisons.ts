// Contenuto della pagina /confronto (consolidata): una sola landing che copre
// tutte le categorie di alternative (registratore telematico, fatturazione B2B,
// SaaS scontrino). I dati sui competitor sono lo snapshot pubblico rilevato
// dai rispettivi siti — riportati senza inferenze per evitare claim falsi.

export interface ConfrontoFaq {
  readonly question: string;
  readonly answer: string;
}

export interface CategorySection {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly whenItFits: readonly string[];
  readonly whenWeFit: readonly string[];
}

export interface CompetitorSnapshot {
  readonly name: string;
  readonly url: string;
  readonly displayUrl: string;
  readonly pricing: string;
  readonly trial: string;
  readonly notes: string;
}

export interface OurPositioning {
  readonly bestFor: readonly string[];
  readonly notBestFor: readonly string[];
}

export interface ConfrontoContent {
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly heroIntro: string;
  readonly categories: readonly CategorySection[];
  readonly saasIntro: string;
  readonly saasCompetitors: readonly CompetitorSnapshot[];
  readonly differentiators: readonly string[];
  readonly ourPositioning: OurPositioning;
  readonly faq: readonly ConfrontoFaq[];
  readonly relatedHelp: readonly string[];
  readonly lastUpdated: string;
}

export const confrontoContent: ConfrontoContent = {
  title: "ScontrinoZero a confronto con le alternative",
  metaTitle: "Alternative a ScontrinoZero: confronto onesto",
  metaDescription:
    "Panoramica onesta delle alternative a ScontrinoZero: registratore telematico, gestionali di fatturazione, altri software per scontrini elettronici (Scontrinare, Scontrina, ScontrinoSenzaCassa, CassaDigitale). Quando ha senso scegliere noi, quando no.",
  heroIntro:
    "Esistono diverse strade per emettere documenti fiscali in Italia: registratore telematico fisico, gestionali di fatturazione B2B, oppure software online che usano la procedura Documento Commerciale Online dell'Agenzia delle Entrate. Questa pagina riassume le opzioni e indica in modo trasparente quando ScontrinoZero è la scelta giusta e quando non lo è. I dati sui competitor sono presi dai loro siti pubblici alla data riportata in fondo: per informazioni aggiornate ti consigliamo di controllare direttamente i loro listini.",
  categories: [
    {
      id: "registratore-telematico",
      title: "Registratore telematico (hardware)",
      intro:
        "È la soluzione classica: stampante fiscale fisica sul bancone, certificata e collaudata periodicamente. Resta un'ottima scelta per attività con flusso costante di clienti al banco.",
      whenItFits: [
        "Volumi elevati di scontrini al giorno con coda al banco.",
        "Punto vendita fisso dove il cliente si aspetta lo scontrino di carta stampato sul momento.",
        "Connessione internet poco affidabile (il registratore lavora anche offline e trasmette in differita).",
      ],
      whenWeFit: [
        "Attività mobile, stagionale o di piccole dimensioni: ambulanti, B&B, artigiani in cantiere, food truck.",
        "Vuoi evitare l'investimento iniziale per l'hardware e i canoni di manutenzione/verifica periodica.",
        "Ti basta uno smartphone connesso a internet per emettere e trasmettere lo scontrino.",
        "Vuoi avere lo storico digitale degli scontrini sempre accessibile, anche da PC.",
      ],
    },
    {
      id: "fatturazione-b2b",
      title: "Gestionali di fatturazione (es. Fatture in Cloud)",
      intro:
        "I gestionali di fatturazione elettronica (Fatture in Cloud, Aruba, FatturaPRO, ecc.) sono pensati per emettere fatture B2B verso aziende e partite IVA via Sistema di Interscambio. Non sono lo stesso strumento di un registratore di cassa: gestiscono adempimenti diversi e in molti casi sono complementari, non alternativi.",
      whenItFits: [
        "Emetti principalmente fatture elettroniche B2B verso aziende e partite IVA.",
        "Hai bisogno di prima nota, anagrafica clienti/fornitori, preventivi e gestione contabile.",
        "Cerchi un gestionale integrato per fatture, magazzino e adempimenti.",
      ],
      whenWeFit: [
        "Vendi al cliente finale (B2C) e ti serve emettere lo scontrino, non la fattura.",
        "Non hai bisogno di un gestionale completo, vuoi solo emettere il documento commerciale velocemente.",
        "Vuoi un'app mobile-first che funzioni dallo smartphone in pochi secondi.",
      ],
    },
    {
      id: "saas-scontrino",
      title: "Altri software online per scontrino elettronico",
      intro:
        "Esistono diversi software online che, come noi, sfruttano la procedura Documento Commerciale Online dell'Agenzia delle Entrate per emettere scontrini senza registratore fisico. La sezione qui sotto riassume le informazioni pubbliche dei principali competitor che conosciamo. Sono tutti software legittimi: cerchiamo di darti un quadro onesto.",
      whenItFits: [
        "Trovi un servizio che ha già una feature avanzata che da noi è ancora in roadmap.",
        "Preferisci un fornitore con più anni di mercato e una base utenti consolidata.",
      ],
      whenWeFit: [
        "Cerchi i prezzi più bassi del mercato fra i software comparabili.",
        "Vuoi la possibilità di auto-ospitare il software gratis sul tuo computer o server.",
        "Vuoi un trial di 30 giorni senza inserire la carta di credito.",
        "Ti interessa poter ispezionare pubblicamente il codice che gestisce le tue credenziali Fisconline.",
      ],
    },
  ],
  saasIntro:
    "I dati qui sotto sono presi dai siti ufficiali dei competitor. Listini e funzionalità possono cambiare in qualsiasi momento: verifica sempre direttamente sul sito di riferimento prima di scegliere.",
  saasCompetitors: [
    {
      name: "Scontrinare",
      url: "https://www.scontrinare.it/",
      displayUrl: "scontrinare.it",
      pricing: "30 €/anno",
      trial: "1° mese gratuito",
      notes:
        "App web e mobile (Android/iOS). Integrazione con POS SumUp e Nexi. Accesso con credenziali Fisconline.",
    },
    {
      name: "Scontrina",
      url: "https://scontrina.it/",
      displayUrl: "scontrina.it",
      pricing: "8,19 €/mese o 65,57 €/anno (IVA esclusa)",
      trial: "Primo scontrino gratis",
      notes:
        "App mobile per smartphone/tablet. Integra SPID/Fisconline, e-commerce (WooCommerce, Shopify) e diversi POS. Dichiara modalità offline.",
    },
    {
      name: "ScontrinoSenzaCassa (Billy)",
      url: "https://www.scontrinosenzacassa.it/",
      displayUrl: "scontrinosenzacassa.it",
      pricing:
        "70 €/anno o 7 €/mese (60 €/anno o 6 €/mese per regime forfettario, prezzi IVA esclusa). Disponibile anche un pacchetto da 50 giorni a 20 € per attività stagionali.",
      trial: "Prova gratuita 7 giorni",
      notes:
        "Web + mobile. Integrazione con più sistemi di pagamento (Nexi, Banca Sella, Viva, SumUp, Dojo, Hobex, Satispay). Emette anche fatture con alcune limitazioni.",
    },
    {
      name: "CassaDigitale",
      url: "https://www.cassadigitale.eu/",
      displayUrl: "cassadigitale.eu",
      pricing: "4,99 €/mese + IVA",
      trial: "30 giorni gratis",
      notes:
        "App mobile (iOS/Android) e web. Accesso via Fisconline/SPID. Emette scontrini e fatture, gestisce chiusure di cassa.",
    },
  ],
  differentiators: [
    "Open source: puoi installarlo gratis sul tuo computer o server, le credenziali Fisconline non transitano da noi.",
    "Trial di 30 giorni senza carta di credito: alla scadenza l'account passa in sola lettura, nessun addebito a sorpresa.",
    "Piani Starter da 29,99 €/anno e Pro da 49,99 €/anno: fra i listini più bassi del mercato.",
    "Pensato per lo smartphone: emetti uno scontrino in pochi secondi, e puoi anche installare l'app direttamente dal browser senza passare dagli store.",
    "Codice sorgente ispezionabile su GitHub, incluso il modulo che cifra le credenziali Fisconline.",
  ],
  ourPositioning: {
    bestFor: [
      "Micro-attività, ambulanti, professionisti e B&B che emettono pochi scontrini al giorno.",
      "Chi cerca il costo annuale più basso e vuole un trial senza obblighi.",
      "Chi apprezza la trasparenza dell'open source e/o vuole l'opzione self-hosted.",
    ],
    notBestFor: [
      "Negozi con flussi elevati e cassa fissa al banco, dove un registratore telematico fisico resta più ergonomico.",
      "Attività che fatturano principalmente B2B e hanno bisogno di un gestionale di fatturazione completo (prima nota, contabilità).",
      "Chi cerca feature gestionali avanzate (magazzino integrato, multi-cassa, sincronizzazioni complesse): valuta soluzioni più mature.",
    ],
  },
  faq: [
    {
      question:
        "Posso usare un software al posto del registratore telematico in modo legale?",
      answer:
        'Sì. La procedura "Documento Commerciale Online" dell\'Agenzia delle Entrate (Fatture e Corrispettivi) è una modalità alternativa al registratore telematico riconosciuta a livello normativo. Lo scontrino emesso ha lo stesso valore fiscale.',
    },
    {
      question:
        "Posso usare ScontrinoZero insieme a un gestionale di fatturazione come Fatture in Cloud?",
      answer:
        "Sì, ed è spesso la combinazione corretta. ScontrinoZero gestisce gli scontrini al cliente finale (B2C); un gestionale di fatturazione gestisce le fatture verso aziende (B2B). Sono adempimenti diversi che convivono per la stessa partita IVA.",
    },
    {
      question:
        "Cosa cambia rispetto agli altri software che fanno scontrino elettronico?",
      answer:
        "I servizi citati in questa pagina sono tutti software legittimi che usano la stessa procedura dell'Agenzia delle Entrate. Le differenze principali stanno nel listino, nella maturità del prodotto e nelle funzionalità offerte. ScontrinoZero punta su prezzo basso, open source e uso da smartphone; gli altri hanno punti di forza diversi da valutare caso per caso.",
    },
    {
      question: "Posso migrare da un altro software a ScontrinoZero?",
      answer:
        "Sì. Le credenziali Fisconline restano le tue: basta crearle in ScontrinoZero, completare l'onboarding e iniziare a emettere. Lo storico precedente resta consultabile nel cassetto fiscale dell'Agenzia delle Entrate, indipendentemente dal software che hai usato prima.",
    },
  ],
  relatedHelp: [
    "pos-rt-obbligo",
    "primo-scontrino",
    "piani-e-prezzi",
    "come-collegare-ade",
    "credenziali-fisconline",
  ],
  lastUpdated: "2026-05",
};
