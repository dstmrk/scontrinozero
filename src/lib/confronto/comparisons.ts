export const comparisonSlugs = [
  "registratore-telematico",
  "scontrinare",
  "fatture-in-cloud",
] as const;

export type ComparisonSlug = (typeof comparisonSlugs)[number];

export interface ComparisonRow {
  readonly label: string;
  readonly competitor: string | boolean;
  readonly ours: string | boolean;
  readonly note?: string;
}

export interface ComparisonFaq {
  readonly question: string;
  readonly answer: string;
}

export interface ComparisonContent {
  readonly slug: ComparisonSlug;
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly competitorName: string;
  readonly heroIntro: string;
  readonly whenToChoose: {
    readonly competitor: readonly string[];
    readonly us: readonly string[];
  };
  readonly rows: readonly ComparisonRow[];
  readonly lastUpdated: string;
  readonly faq: readonly ComparisonFaq[];
  readonly relatedHelp: readonly string[];
}

export const comparisons: Record<ComparisonSlug, ComparisonContent> = {
  "registratore-telematico": {
    slug: "registratore-telematico",
    title: "ScontrinoZero vs registratore telematico",
    metaTitle: "ScontrinoZero vs registratore telematico: confronto onesto",
    metaDescription:
      "Confronto fra ScontrinoZero (scontrino elettronico via smartphone) e un registratore telematico fisico: costi, installazione, collaudo, mobilità. Tradeoff onesti.",
    competitorName: "Registratore telematico",
    heroIntro:
      "Il registratore telematico (RT) è la soluzione hardware classica: stampante fiscale fisica sul bancone, certificata dall'Agenzia delle Entrate. ScontrinoZero è la sua alternativa software per chi emette pochi scontrini al giorno o lavora in mobilità. Non sono uguali: ognuno ha senso in contesti diversi.",
    whenToChoose: {
      competitor: [
        "Volumi elevati di scontrini al giorno (es. negozio con coda alla cassa).",
        "Lavori in un punto vendita fisso con connessione internet poco affidabile.",
        "Il cliente vuole vedere e ricevere subito uno scontrino di carta stampato al banco.",
      ],
      us: [
        "Sei un'attività mobile, stagionale o di piccole dimensioni (ambulanti, B&B, artigiani in cantiere).",
        "Vuoi evitare €400–800 di hardware iniziale e i €100–200 annui di canone e collaudi.",
        "Ti basta uno smartphone connesso a internet per emettere e trasmettere.",
        "Vuoi avere lo storico digitale degli scontrini sempre accessibile, anche da PC.",
      ],
    },
    rows: [
      {
        label: "Costo acquisto hardware",
        competitor: "€400–800",
        ours: "€0",
      },
      {
        label: "Canone annuo / abbonamento",
        competitor: "€100–200",
        ours: "da €29,99",
      },
      {
        label: "Installazione tecnico abilitato",
        competitor: "obbligatoria",
        ours: false,
      },
      {
        label: "Verifica/collaudo biennale",
        competitor: "obbligatorio",
        ours: false,
      },
      {
        label: "Aggiornamenti firmware/software",
        competitor: "a pagamento",
        ours: "inclusi",
      },
      {
        label: "Funziona da smartphone in mobilità",
        competitor: false,
        ours: true,
      },
      {
        label: "Stampante termica integrata",
        competitor: true,
        ours: false,
        note: "ScontrinoZero invia lo scontrino via QR / link; stampa cartacea opzionale con stampante esterna.",
      },
      {
        label: "Funziona senza connessione internet",
        competitor: true,
        ours: false,
        note: "Per la trasmissione AdE serve comunque connessione.",
      },
      {
        label: "Trasmissione corrispettivi automatica",
        competitor: true,
        ours: true,
      },
      {
        label: "Storico digitale ed esportazione",
        competitor: "limitato",
        ours: "completo",
      },
    ],
    lastUpdated: "2026-05",
    faq: [
      {
        question:
          "Posso usare ScontrinoZero al posto del registratore telematico in modo legale?",
        answer:
          'Sì. ScontrinoZero usa la procedura ufficiale "Documento Commerciale Online" dell\'Agenzia delle Entrate (Fatture e Corrispettivi), riconosciuta come modalità alternativa al registratore telematico. Lo scontrino emesso è fiscalmente valido a tutti gli effetti.',
      },
      {
        question:
          "Se ho già un registratore telematico, mi conviene passare a ScontrinoZero?",
        answer:
          "Dipende dal volume di scontrini e dalla manutenzione che già paghi. Se emetti pochi scontrini al giorno e hai canoni di manutenzione elevati, il TCO a 5 anni di ScontrinoZero è significativamente più basso. Se hai volumi alti e una cassa fissa al banco, il registratore fisico resta più ergonomico.",
      },
      {
        question: "Lo scontrino di ScontrinoZero ha valore probatorio fiscale?",
        answer:
          "Sì. Il documento commerciale online è equiparato allo scontrino del registratore telematico. Riporta progressivo, data, IVA distinta per aliquota, e codice lotteria. Può essere stampato o inviato digitalmente al cliente.",
      },
    ],
    relatedHelp: ["pos-rt-obbligo", "primo-scontrino", "piani-e-prezzi"],
  },
  scontrinare: {
    slug: "scontrinare",
    title: "ScontrinoZero vs Scontrinare",
    metaTitle: "ScontrinoZero vs Scontrinare: confronto fra alternative SaaS",
    metaDescription:
      "Confronto trasparente fra ScontrinoZero e Scontrinare: pricing, mobile-first, open source, integrazione AdE. Quando scegliere uno o l'altro.",
    competitorName: "Scontrinare",
    heroIntro:
      "Scontrinare è uno dei competitor SaaS più noti per l'emissione del documento commerciale online in Italia. È sul mercato da più anni di noi e ha una base utenti consolidata. ScontrinoZero è più giovane, open source e con un'attenzione esplicita al mobile-first e al prezzo basso.",
    whenToChoose: {
      competitor: [
        "Cerchi un servizio con più anni di mercato e una community consolidata.",
        "Hai bisogno di feature avanzate che potrebbero essere già in catalogo da loro mentre da noi sono ancora in roadmap.",
      ],
      us: [
        "Vuoi il prezzo annuale più basso del mercato (Starter €29,99/anno).",
        "Preferisci un servizio open source con licenza permissiva: puoi auto-ospitarlo gratis sul tuo server.",
        "Vuoi un'esperienza pensata mobile-first per emettere scontrini dallo smartphone in pochi secondi.",
        "Vuoi sapere esattamente dove finiscono le tue credenziali Fisconline (codice ispezionabile su GitHub).",
      ],
    },
    rows: [
      {
        label: "Piano d'ingresso (annuale)",
        competitor: "circa €30/anno",
        ours: "€29,99/anno",
        note: "Verifica sempre il listino aggiornato sui siti ufficiali.",
      },
      {
        label: "Trial senza carta di credito",
        competitor: "verifica condizioni",
        ours: "30 giorni",
      },
      {
        label: "Emissione documento commerciale AdE",
        competitor: true,
        ours: true,
      },
      {
        label: "Annullamento scontrino",
        competitor: true,
        ours: true,
      },
      {
        label: "Lotteria degli Scontrini",
        competitor: true,
        ours: true,
      },
      {
        label: "App installabile (PWA)",
        competitor: "verifica",
        ours: true,
      },
      {
        label: "Open source / self-hosted gratis",
        competitor: false,
        ours: true,
        note: "Licenza O'Saasy: codice su GitHub, auto-hosting libero per uso non-SaaS.",
      },
      {
        label: "API per developer",
        competitor: "verifica",
        ours: "in arrivo",
      },
      {
        label: "Storico ed esportazione",
        competitor: true,
        ours: true,
      },
    ],
    lastUpdated: "2026-05",
    faq: [
      {
        question:
          "Posso migrare da Scontrinare a ScontrinoZero senza interrompere il servizio?",
        answer:
          "Sì. Le credenziali Fisconline restano le tue: basta crearle in ScontrinoZero, completare l'onboarding e iniziare a emettere. Lo storico precedente resta consultabile nel cassetto fiscale dell'Agenzia delle Entrate.",
      },
      {
        question: "Cosa significa che ScontrinoZero è open source?",
        answer:
          "Il codice sorgente è pubblicato su GitHub con licenza O'Saasy (permissiva come MIT, ma vieta l'uso per offrire un SaaS concorrente). Puoi ispezionarlo, contribuire, o auto-ospitarlo sul tuo server senza pagare nulla. La versione hosted a pagamento è il servizio gestito che offriamo noi.",
      },
      {
        question: "Le mie credenziali Fisconline sono al sicuro?",
        answer:
          "Sono cifrate AES-256-GCM con una chiave separata per ambiente e non sono mai trasmesse in chiaro né lette dal team di sviluppo. Il codice della cifratura è ispezionabile pubblicamente su GitHub, a differenza dei competitor closed source.",
      },
    ],
    relatedHelp: [
      "come-collegare-ade",
      "credenziali-fisconline",
      "piani-e-prezzi",
      "primo-scontrino",
    ],
  },
  "fatture-in-cloud": {
    slug: "fatture-in-cloud",
    title: "ScontrinoZero vs Fatture in Cloud",
    metaTitle: "ScontrinoZero vs Fatture in Cloud: scontrino o fattura?",
    metaDescription:
      "Differenze fra ScontrinoZero (scontrini elettronici al cliente finale) e Fatture in Cloud (fatturazione elettronica B2B). Quando ti serve l'uno, quando l'altro.",
    competitorName: "Fatture in Cloud",
    heroIntro:
      "Fatture in Cloud è uno dei gestionali di fatturazione elettronica più diffusi in Italia: fattura B2B, prima nota, gestione clienti e fornitori. ScontrinoZero fa una cosa sola e la fa bene: emettere scontrini elettronici (documenti commerciali online) al cliente finale. Sono complementari, non sostituti.",
    whenToChoose: {
      competitor: [
        "Emetti principalmente fatture elettroniche B2B verso aziende e partite IVA.",
        "Hai bisogno di gestione clienti/fornitori, prima nota e adempimenti contabili completi.",
        "Vuoi un gestionale integrato per fatture, preventivi, magazzino e contabilità.",
      ],
      us: [
        "Emetti corrispettivi al cliente finale (B2C): bar, ambulanti, parrucchieri, artigiani.",
        "Non hai bisogno di un gestionale completo, vuoi solo emettere lo scontrino velocemente.",
        "Cerchi il costo più basso possibile per essere in regola con i corrispettivi.",
        "Vuoi un'app mobile-first che funziona dallo smartphone, non un gestionale desktop.",
      ],
    },
    rows: [
      {
        label: "Scontrino elettronico (documento commerciale)",
        competitor: false,
        ours: true,
        note: "Fatture in Cloud è specializzato in fatture, non in corrispettivi al cliente finale.",
      },
      {
        label: "Fatturazione elettronica B2B (SDI)",
        competitor: true,
        ours: false,
        note: "ScontrinoZero non è un gestionale di fatturazione.",
      },
      {
        label: "Trasmissione corrispettivi automatica AdE",
        competitor: false,
        ours: true,
      },
      {
        label: "Annullamento scontrino conforme",
        competitor: false,
        ours: true,
      },
      {
        label: "Lotteria degli Scontrini",
        competitor: false,
        ours: true,
      },
      {
        label: "Prima nota e gestione contabile",
        competitor: true,
        ours: false,
      },
      {
        label: "Anagrafica clienti/fornitori",
        competitor: true,
        ours: false,
      },
      {
        label: "Piano d'ingresso (annuale)",
        competitor: "da circa €70/anno",
        ours: "€29,99/anno",
      },
      {
        label: "Open source / self-hosted",
        competitor: false,
        ours: true,
      },
    ],
    lastUpdated: "2026-05",
    faq: [
      {
        question: "Posso usare ScontrinoZero e Fatture in Cloud insieme?",
        answer:
          "Sì, e in molti casi è la scelta corretta. ScontrinoZero gestisce gli scontrini al cliente finale (B2C); Fatture in Cloud gestisce le fatture verso aziende (B2B). Sono adempimenti diversi che convivono per la stessa partita IVA: l'uno non sostituisce l'altro.",
      },
      {
        question: "Quando emetto fattura e quando emetto scontrino?",
        answer:
          "Emetti fattura quando il cliente è una partita IVA o quando lo richiede esplicitamente. Emetti scontrino (documento commerciale) per le vendite al consumatore finale che paga al momento. Se il cliente paga e va via senza chiedere documenti specifici, lo scontrino è il documento corretto.",
      },
      {
        question:
          "Sono in regime forfettario: mi serve davvero uno scontrino elettronico?",
        answer:
          "Dipende dall'attività. Se vendi al pubblico (B2C) e non emetti fattura, sì: il documento commerciale è obbligatorio. Se la tua attività è principalmente B2B e fai solo fatture elettroniche, lo scontrino non si applica. Verifica sempre con il tuo commercialista in base al codice ATECO.",
      },
    ],
    relatedHelp: [
      "fatture-e-ricevute",
      "primo-scontrino",
      "regime-forfettario",
    ],
  },
};

const COMPARISON_SLUG_SET: ReadonlySet<string> = new Set(comparisonSlugs);

export function isComparisonSlug(slug: string): slug is ComparisonSlug {
  return COMPARISON_SLUG_SET.has(slug);
}

export function getComparison(slug: string): ComparisonContent {
  if (!isComparisonSlug(slug)) {
    throw new Error(`Unknown comparison slug: ${slug}`);
  }
  return comparisons[slug];
}
