export const toolSlugs = [
  "scorporo-iva",
  "verifica-codice-lotteria",
  "calcolatore-risparmio-rt",
  "dicitura-regime-forfettario",
] as const;

export type ToolSlug = (typeof toolSlugs)[number];

export interface ToolFaq {
  readonly question: string;
  readonly answer: string;
}

export interface ToolContent {
  readonly slug: ToolSlug;
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly heroIntro: string;
  readonly howItWorks: readonly string[];
  readonly faq: readonly ToolFaq[];
  readonly relatedHelp: readonly string[];
  /** Slug di /guide collegati (cross-link del cluster, es. forfettario). */
  readonly relatedGuides?: readonly string[];
}

export const tools: Record<ToolSlug, ToolContent> = {
  "scorporo-iva": {
    slug: "scorporo-iva",
    title: "Scorporo IVA",
    metaTitle: "Scorporo IVA online: calcolo imponibile e IVA dal lordo",
    metaDescription:
      "Calcolatore IVA gratuito: scorpora l'IVA dal lordo o aggiungila al netto. Aliquote 4%, 5%, 10%, 22%. Risultato istantaneo con imponibile, IVA e totale.",
    heroIntro:
      "Due calcoli in uno: scorpora l'IVA da un importo lordo per ottenere imponibile e imposta, oppure parti dal netto e aggiungi l'IVA per ottenere il totale. Funziona con le aliquote italiane standard (4%, 5%, 10%, 22%) e con qualunque aliquota fra 0 e 99%.",
    howItWorks: [
      "Scegli la modalità: «Scorpora IVA» (parti dal lordo) o «Aggiungi IVA» (parti dal netto).",
      "Inserisci l'importo e scegli l'aliquota IVA (es. 22%).",
      "Ottieni imponibile, IVA e lordo scomposti all'istante.",
    ],
    faq: [
      {
        question: "Qual è la formula per scorporare l'IVA da un importo lordo?",
        answer:
          "Imponibile = Lordo / (1 + aliquota/100). IVA = Lordo − Imponibile. Esempio con lordo 122 € e aliquota 22%: 122 / 1,22 = 100 €, IVA = 22 €. Lo strumento usa aritmetica sui centesimi per evitare errori di arrotondamento.",
      },
      {
        question: "Quali aliquote IVA sono in vigore in Italia?",
        answer:
          "Le aliquote standard sono 4% (beni di prima necessità), 5% (alcuni servizi sanitari/sociali), 10% (ristorazione, turismo, alcuni alimenti) e 22% (ordinaria). Esistono operazioni esenti (aliquota 0%) e non imponibili: in quei casi non si applica scorporo.",
      },
      {
        question: "Posso usarlo per le fatture elettroniche o gli scontrini?",
        answer:
          "Sì, è utile come verifica veloce. Per documenti fiscali ufficiali (fatture, scontrini, ricevute) usa sempre il software che li emette: il valore fiscale lo dà il documento, non il calcolatore.",
      },
      {
        question: "Come si calcola l'IVA partendo dal prezzo lordo?",
        answer:
          "Si divide il lordo per (1 + aliquota/100) per ottenere l'imponibile, poi si sottrae l'imponibile dal lordo per ottenere l'IVA. Con lordo 122 € e aliquota 22%: imponibile = 122 / 1,22 = 100 €, IVA = 122 − 100 = 22 €. Il calcolatore qui sopra lo fa per te in tempo reale.",
      },
      {
        question: "Qual è la differenza tra importo lordo, netto e IVA?",
        answer:
          "Il lordo (o \"IVA inclusa\") è il prezzo che paga il cliente. Il netto (o imponibile) è il prezzo al netto dell'imposta. L'IVA è la differenza tra i due. Scorporare significa proprio separare il netto e l'IVA partendo dal lordo: l'operazione inversa rispetto ad applicare l'IVA a un imponibile.",
      },
      {
        question: "Come aggiungo l'IVA a un imponibile netto?",
        answer:
          "Moltiplica l'imponibile per l'aliquota per ottenere l'IVA, poi sommala al netto. Esempio con netto 100 € al 22%: IVA = 100 × 22% = 22 €, lordo = 100 + 22 = 122 €. Con la modalità «Aggiungi IVA» dello strumento qui sopra lo calcoli in tempo reale, partendo dall'imponibile invece che dal lordo.",
      },
      {
        question: "Qual è la differenza tra scorporare e aggiungere l'IVA?",
        answer:
          "Sono operazioni inverse. Scorporare parte dal lordo (IVA inclusa) e ricava imponibile e imposta dividendo per (1 + aliquota/100). Aggiungere parte dal netto (imponibile) e calcola l'imposta da sommare per ottenere il lordo. Questo strumento fa entrambe: scegli la modalità con il selettore in alto.",
      },
      {
        question: "Come trovo il prezzo senza IVA da un prezzo IVA inclusa?",
        answer:
          "Il prezzo senza IVA è l'imponibile: lo ottieni dividendo il prezzo IVA inclusa per (1 + aliquota/100). Esempio con 110 € al 10%: 110 / 1,10 = 100 € senza IVA. È esattamente ciò che calcola questo strumento.",
      },
      {
        question:
          "Il calcolatore di scorporo IVA è gratuito e funziona online?",
        answer:
          "Sì: è gratuito, funziona direttamente nel browser da smartphone o PC, senza registrazione e senza inviare dati a server esterni. Il calcolo avviene in locale sul tuo dispositivo.",
      },
    ],
    relatedHelp: ["aliquote-iva", "fatture-e-ricevute", "regime-forfettario"],
  },
  "verifica-codice-lotteria": {
    slug: "verifica-codice-lotteria",
    title: "Verifica codice Lotteria degli Scontrini",
    metaTitle: "Verifica codice Lotteria Scontrini: formato 8 caratteri",
    metaDescription:
      "Controlla se il tuo codice Lotteria degli Scontrini ha il formato corretto: 8 caratteri alfanumerici maiuscoli (A-Z, 0-9). Senza inviare nulla, solo formato.",
    heroIntro:
      "Il codice Lotteria degli Scontrini dell'Agenzia delle Entrate è una stringa di 8 caratteri (lettere maiuscole A-Z e numeri 0-9). Questo tool verifica solo il formato del codice: non interroga la banca dati AdE e non comunica nulla all'esterno.",
    howItWorks: [
      "Genera il tuo codice su lotteriadegliscontrini.gov.it.",
      "Incollalo qui sotto e premi Verifica.",
      "Ti diciamo se il formato è valido (8 caratteri [A-Z0-9]) o cosa correggere.",
    ],
    faq: [
      {
        question: "Cos'è il codice Lotteria degli Scontrini?",
        answer:
          "È un codice generato dal Portale Lotteria dell'Agenzia delle Entrate (lotteriadegliscontrini.gov.it) che il consumatore può comunicare all'esercente al momento del pagamento elettronico per partecipare alle estrazioni. Il commerciante lo riporta sullo scontrino tramite il software di emissione.",
      },
      {
        question: "Questo strumento controlla anche la validità presso AdE?",
        answer:
          "No, controlliamo solo il formato (8 caratteri alfanumerici maiuscoli). La validità del codice presso l'AdE viene verificata in fase di trasmissione dello scontrino: se il codice è disattivato o non esiste, AdE risponde con un errore.",
      },
      {
        question: "Il mio codice è in minuscolo: posso usarlo lo stesso?",
        answer:
          "Il formato AdE prevede caratteri maiuscoli. Convertilo in maiuscolo prima di comunicarlo all'esercente. Se lo digiti in minuscolo, questo tool ti segnalerà l'errore senza convertirlo automaticamente, per evitare ambiguità.",
      },
    ],
    relatedHelp: ["primo-scontrino", "errori-ade", "intestazione-scontrino"],
  },
  "calcolatore-risparmio-rt": {
    slug: "calcolatore-risparmio-rt",
    title: "Calcolatore risparmio vs registratore telematico",
    metaTitle: "Quanto risparmi senza registratore telematico in 5 anni",
    metaDescription:
      "Stima il TCO a 5 anni del registratore telematico fisico (hardware + canoni) e confrontalo con ScontrinoZero. Risultato istantaneo, basato sul volume mensile.",
    heroIntro:
      "Inserisci quanti scontrini emetti al mese e calcoliamo quanto costa un registratore telematico (RT) fisico nei prossimi 5 anni rispetto al piano ScontrinoZero appropriato. Le stime usano costi medi di mercato aggiornati al 2026.",
    howItWorks: [
      "Indica quanti scontrini emetti mediamente al mese.",
      "Ti suggeriamo il piano ScontrinoZero adatto al volume.",
      "Confrontiamo il TCO a 5 anni: hardware + canoni RT vs piano annuale ScontrinoZero.",
    ],
    faq: [
      {
        question: "Come è calcolato il costo del registratore telematico?",
        answer:
          "Stimiamo €500 per acquisto e collaudo iniziale, più €150 all'anno di canone, manutenzione e verifica biennale ammortizzata. Sono valori medi di mercato per un RT entry-level destinato a piccole attività italiane. Il TCO reale può crescere con servizi aggiuntivi (carta termica premium, telecamere, ecc.).",
      },
      {
        question: "Quando conviene ScontrinoZero rispetto a un RT?",
        answer:
          "Per volumi bassi/medi (fino a 500–1.000 scontrini/mese) e quando lavori in mobilità o stagionalmente, ScontrinoZero ha un TCO molto più basso. Sopra quei volumi un RT fisico al banco resta più ergonomico, ma non è obbligatorio: puoi anche affiancare i due strumenti.",
      },
      {
        question:
          "Lo scontrino di ScontrinoZero ha valore fiscale come quello del RT?",
        answer:
          "Sì. ScontrinoZero usa la procedura ufficiale 'Documento Commerciale Online' di AdE. Lo scontrino è equiparato a quello del registratore telematico: stesso valore probatorio, stesso codice lotteria, stessa trasmissione corrispettivi.",
      },
    ],
    relatedHelp: ["pos-rt-obbligo", "normativa-pos-2026", "piani-e-prezzi"],
  },
  "dicitura-regime-forfettario": {
    slug: "dicitura-regime-forfettario",
    title: "Generatore dicitura regime forfettario",
    metaTitle: "Dicitura regime forfettario: testo esenzione IVA da copiare",
    metaDescription:
      "Genera la dicitura di esenzione IVA del regime forfettario (art. 1 commi 54-89 L. 190/2014) pronta da copiare: fattura vs scontrino, ritenuta d'acconto e bollo.",
    heroIntro:
      "La dicitura del regime forfettario è: «Operazione effettuata ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario». Va riportata solo sulle fatture: sullo scontrino elettronico non serve, basta la natura IVA N2. Qui sotto generi il testo completo da copiare, con la clausola sulla ritenuta d'acconto e l'avviso marca da bollo.",
    howItWorks: [
      "Scegli il documento che devi emettere: fattura oppure scontrino.",
      "Per la fattura, aggiungi se serve la clausola sulla ritenuta d'acconto (comma 67) e indica l'importo per il controllo della marca da bollo.",
      "Copia la dicitura con un tocco e incollala nel tuo software di fatturazione.",
    ],
    faq: [
      {
        question: "Qual è la dicitura per il regime forfettario?",
        answer:
          "La formula standard è: \"Operazione effettuata ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario\". Se il cliente è un sostituto d'imposta si aggiunge la clausola sulla non applicazione della ritenuta d'acconto ai sensi del comma 67 della stessa legge.",
      },
      {
        question:
          "Serve la dicitura di esenzione sullo scontrino del forfettario?",
        answer:
          "No. Sullo scontrino elettronico (documento commerciale online) non è richiesta alcuna dicitura: è sufficiente che le righe siano emesse con natura IVA N2 (operazioni non soggette). La dicitura è obbligatoria solo sulle fatture.",
      },
      {
        question:
          "Va bene anche la formula «operazione senza applicazione dell'IVA»?",
        answer:
          'Sì. Varianti come "Operazione senza applicazione dell\'IVA ai sensi dell\'art. 1, commi 54-89, della Legge 190/2014" o "Operazione in franchigia da IVA" sono equivalenti: ciò che conta è il richiamo esplicito all\'articolo 1, commi da 54 a 89, della Legge 190/2014, che identifica il regime forfettario.',
      },
      {
        question: "Quando serve la marca da bollo da 2 euro?",
        answer:
          "Sulle fatture del forfettario di importo superiore a 77,47 €: essendo operazioni senza IVA, scatta l'imposta di bollo di 2,00 € (DPR 642/1972). Per la fattura elettronica il bollo si assolve in modo virtuale, con versamento trimestrale tramite il servizio dell'Agenzia delle Entrate. Sullo scontrino il bollo non si applica.",
      },
      {
        question:
          "Cosa significa la clausola sulla ritenuta d'acconto (comma 67)?",
        answer:
          "I compensi del forfettario non sono soggetti a ritenuta alla fonte: l'articolo 1, comma 67, della Legge 190/2014 lo stabilisce espressamente. La clausola in fattura serve a informare il committente sostituto d'imposta (es. un'azienda) di non trattenere la ritenuta d'acconto sul pagamento.",
      },
      {
        question: "Il codice natura IVA da usare è N2 o N2.2?",
        answer:
          "Dipende dal documento: sulla fattura elettronica il forfettario usa il codice granulare N2.2 (non soggette - altri casi), mentre sullo scontrino elettronico il tracciato prevede solo il codice aggregato N2. Stesso concetto, due tracciati diversi dell'Agenzia delle Entrate.",
      },
    ],
    relatedHelp: ["regime-forfettario", "aliquote-iva", "fatture-e-ricevute"],
    relatedGuides: ["codici-natura-iva", "scontrino-regime-forfettario"],
  },
};

const TOOL_SLUG_SET: ReadonlySet<string> = new Set(toolSlugs);

export function isToolSlug(slug: string): slug is ToolSlug {
  return TOOL_SLUG_SET.has(slug);
}

export function getTool(slug: string): ToolContent {
  if (!isToolSlug(slug)) {
    throw new Error(`Unknown tool slug: ${slug}`);
  }
  return tools[slug];
}
