export const toolSlugs = [
  "scorporo-iva",
  "verifica-codice-lotteria",
  "calcolatore-risparmio-rt",
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
}

export const tools: Record<ToolSlug, ToolContent> = {
  "scorporo-iva": {
    slug: "scorporo-iva",
    title: "Scorporo IVA",
    metaTitle: "Scorporo IVA online: calcolo imponibile e IVA dal lordo",
    metaDescription:
      "Calcolatore gratuito per scorporare l'IVA da un importo lordo. Aliquote 4%, 5%, 10%, 22%. Risultato istantaneo con netto e IVA scomposti.",
    heroIntro:
      "Inserisci un importo lordo e un'aliquota IVA: ti mostriamo l'imponibile netto e l'IVA scorporata. Funziona per le aliquote italiane standard (4%, 5%, 10%, 22%) e per qualunque aliquota personalizzata fra 0 e 99%.",
    howItWorks: [
      "Inserisci l'importo lordo (es. 122 €).",
      "Scegli l'aliquota IVA (es. 22%).",
      "Ottieni l'imponibile (100 €) e l'IVA (22 €).",
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
      "Inserisci quanti scontrini emetti al mese e calcoliamo quanto costa un registratore telematico (RT) fisico nei prossimi 5 anni rispetto al piano ScontrinoZero appropriato. Le stime usano costi medi di mercato (gennaio 2026).",
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
