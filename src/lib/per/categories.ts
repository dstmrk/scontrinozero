export interface CategoryFaq {
  readonly question: string;
  readonly answer: string;
}

export interface CategoryContent {
  readonly slug: CategorySlug;
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly heroSubtitle: string;
  readonly audience: string;
  readonly useCase: string;
  readonly obligations: readonly string[];
  readonly benefits: readonly string[];
  readonly faq: readonly CategoryFaq[];
  readonly relatedHelp: readonly [string, string, string];
}

export type CategorySlug =
  | "ambulanti"
  | "parrucchieri-estetisti"
  | "artigiani"
  | "b-and-b"
  | "regime-forfettario"
  | "professionisti";

export const categorySlugs: readonly CategorySlug[] = [
  "ambulanti",
  "parrucchieri-estetisti",
  "artigiani",
  "b-and-b",
  "regime-forfettario",
  "professionisti",
];

export const categories: Record<CategorySlug, CategoryContent> = {
  ambulanti: {
    slug: "ambulanti",
    title: "Registratore di cassa per ambulanti e mercati",
    metaTitle: "Registratore di cassa per ambulanti | ScontrinoZero",
    metaDescription:
      "Emetti scontrini elettronici al mercato direttamente dallo smartphone. Nessun registratore fisico, nessun canone. Da €2,50/mese, 30 giorni di prova gratuita.",
    heroSubtitle:
      "Emetti scontrini al banco del mercato, dal furgone, ovunque sei. Basta lo smartphone che hai già in tasca.",
    audience: "ambulanti, operatori di mercato, venditori su area pubblica",
    useCase:
      "Se vendi al mercato settimanale, alle fiere, in spiaggia o porta a porta, il registratore di cassa fisso è scomodo: pesa, va alimentato, va portato dietro. ScontrinoZero ti permette di emettere lo scontrino elettronico (Documento Commerciale Online) direttamente dallo smartphone, anche con connessione mobile, e di trasmettere automaticamente i corrispettivi all'Agenzia delle Entrate a fine giornata.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni vendita B2C, anche di piccolo importo (DPR 633/72 art. 22).",
      "Trasmissione telematica dei corrispettivi all'Agenzia delle Entrate entro 12 giorni dalla data dell'operazione.",
      "Conservazione del documento per 10 anni (in versione digitale è sufficiente).",
      "Indicazione del codice lotteria se richiesto dal cliente (Lotteria degli Scontrini).",
    ],
    benefits: [
      "Funziona ovunque ci sia rete 4G/5G, anche senza linea fissa.",
      "Non serve hardware: zero investimento iniziale, niente registratore da trasportare.",
      "Pagamenti misti (contanti + carte + buoni) gestiti in pochi tap.",
      "Storico vendite consultabile su qualsiasi dispositivo, utile per il commercialista.",
    ],
    faq: [
      {
        question: "Posso usarlo senza connessione internet?",
        answer:
          "Serve una connessione attiva al momento dell'emissione per ottenere il numero progressivo da AdE. La maggior parte dei piani dati 4G/5G è sufficiente. Per ora non esiste una modalità offline per l'emissione fiscale, ma la trasmissione successiva è automatica.",
      },
      {
        question: "Va bene anche per chi è in regime forfettario?",
        answer:
          "Sì. Il regime forfettario non esonera dall'emissione del documento commerciale verso privati. ScontrinoZero gestisce correttamente la natura N2.2 e l'assenza di IVA tipica del forfettario.",
      },
      {
        question: "Quanto costa al mese?",
        answer:
          "Il piano Starter parte da €4,99/mese (€2,50/mese se annuale) e include scontrini illimitati. Nessuna commissione per transazione.",
      },
    ],
    relatedHelp: ["primo-scontrino", "regime-forfettario", "installare-app"],
  },
  "parrucchieri-estetisti": {
    slug: "parrucchieri-estetisti",
    title: "Scontrino elettronico per parrucchieri, estetisti e tatuatori",
    metaTitle:
      "Scontrino elettronico per parrucchieri ed estetisti | ScontrinoZero",
    metaDescription:
      "Gestisci scontrini e incassi del salone da tablet o smartphone. Senza registratore sul banco, senza canoni. Da €2,50/mese, prova 30 giorni gratis.",
    heroSubtitle:
      "Emetti scontrini dal tablet alla reception o dallo smartphone in cabina, senza ingombrare il banco con un registratore fisico.",
    audience:
      "parrucchieri, estetisti, tatuatori e operatori dei servizi alla persona",
    useCase:
      "Nel salone o studio estetico ogni minuto conta: lo scontrino al cliente che paga deve essere veloce e ordinato. ScontrinoZero sostituisce il registratore telematico con un'app sul tablet alla reception (o sullo smartphone se lavori in cabina). Il cliente riceve uno scontrino conforme via stampa Bluetooth oppure in formato digitale via link.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni prestazione di servizio o vendita di prodotto B2C.",
      "Applicazione dell'aliquota IVA corretta (22% per la maggior parte dei servizi di acconciatura/estetica).",
      "Trasmissione corrispettivi entro 12 giorni dall'operazione.",
      "Esposizione del prezzo dei trattamenti come da Codice del Consumo.",
    ],
    benefits: [
      "Tablet alla reception: zero ingombro sul banco, design pulito da salone moderno.",
      "Gestione di pagamenti misti (es. parte in carta, parte in contanti, gift card).",
      "Catalogo prodotti e servizi configurabile, per emettere lo scontrino in 2 tap.",
      "Storico consultabile dal commercialista senza dover esportare nulla manualmente.",
    ],
    faq: [
      {
        question:
          "Posso emettere scontrino per prodotti rivenduti e servizi nella stessa transazione?",
        answer:
          "Sì. ScontrinoZero permette di aggiungere più righe nello stesso scontrino con aliquote IVA diverse: il taglio capelli al 22% e la rivendita di prodotti specifici secondo l'aliquota dovuta, tutto in un solo documento.",
      },
      {
        question: "Serve uno scanner di codici a barre per i prodotti?",
        answer:
          "No. Per chi vende pochi prodotti il catalogo manuale è sufficiente. Il barcode scanner via fotocamera arriverà in versione successiva (v1.9.0).",
      },
      {
        question: "Posso stampare lo scontrino su carta?",
        answer:
          "Lo scontrino è digitale per natura. Puoi consegnarlo via link/QR oppure stamparlo su carta termica con una stampante Bluetooth 58/80mm (supporto nativo in arrivo, v1.10.0). Già oggi puoi salvare il PDF e stamparlo.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "intestazione-scontrino"],
  },
  artigiani: {
    slug: "artigiani",
    title: "Scontrino elettronico per artigiani e installatori",
    metaTitle: "Scontrino elettronico per artigiani | ScontrinoZero",
    metaDescription:
      "Idraulici, elettricisti, meccanici: emetti lo scontrino direttamente dal cantiere o dal furgone, con lo smartphone. Da €2,50/mese, 30 giorni gratis.",
    heroSubtitle:
      "Emetti lo scontrino dal cantiere, dal furgone o dal laboratorio. Niente registratore in officina, niente carta che si perde.",
    audience:
      "artigiani: idraulici, elettricisti, meccanici, falegnami, muratori",
    useCase:
      "Quando lavori a domicilio del cliente o in cantiere, portare un registratore di cassa è impensabile. Con ScontrinoZero emetti lo scontrino elettronico direttamente al termine dell'intervento, dal tuo smartphone, e il cliente lo riceve via link o stampa. Per i pagamenti in officina basta un tablet alla cassa.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni intervento o vendita verso un privato.",
      "Indicazione dell'aliquota IVA corretta per il tipo di prestazione (10% interventi su immobili residenziali ricorrendone i requisiti, 22% standard).",
      "Trasmissione corrispettivi all'AdE entro 12 giorni.",
      "Iscrizione INPS gestione artigiani e relativi obblighi previdenziali.",
    ],
    benefits: [
      "Emissione mobile: lo smartphone che hai già è il tuo registratore di cassa.",
      'Gestione del catalogo di servizi ricorrenti (es. "manutenzione caldaia", "sostituzione lampadario") per emettere in pochi tap.',
      "Annullamento conforme di scontrini errati, senza rifare carte o chiamare il commercialista.",
      "Dati centralizzati e accessibili da qualsiasi dispositivo: niente blocchetti smarriti tra il furgone e l'officina.",
    ],
    faq: [
      {
        question:
          "Per gli interventi su prima casa posso applicare l'IVA al 10%?",
        answer:
          "L'aliquota IVA agevolata al 10% si applica a specifiche manutenzioni ordinarie e straordinarie su immobili a prevalente destinazione abitativa privata (DPR 633/72 Tab. A, parte III, n. 127-duodecies). ScontrinoZero ti permette di scegliere l'aliquota corretta per ogni riga. Verifica con il commercialista i casi limite.",
      },
      {
        question: "Se rilascio già fattura, devo emettere anche lo scontrino?",
        answer:
          "No. Se per la prestazione emetti fattura elettronica al cliente (anche se privato), lo scontrino non è dovuto. ScontrinoZero serve quando il cliente paga al momento e non richiede fattura.",
      },
      {
        question:
          "Posso usarlo anche senza partita IVA artigiana, da occasionale?",
        answer:
          "ScontrinoZero richiede partita IVA attiva con credenziali Fisconline. La prestazione occasionale non è il caso d'uso target, perché non rientra negli obblighi di emissione del documento commerciale.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "annullare-scontrino"],
  },
  "b-and-b": {
    slug: "b-and-b",
    title: "Scontrino elettronico per B&B e strutture ricettive",
    metaTitle: "Scontrino elettronico per B&B e affittacamere | ScontrinoZero",
    metaDescription:
      "Gestisci scontrini per B&B, affittacamere e strutture stagionali senza registratore fisico. Ideale per attività che aprono pochi mesi all'anno. Da €2,50/mese.",
    heroSubtitle:
      "Soluzione ideale per attività ricettive stagionali: nessun canone fisso annuale per un registratore che useresti solo nei mesi di alta stagione.",
    audience:
      "gestori di B&B, affittacamere, case vacanza e strutture ricettive minori",
    useCase:
      "Se gestisci un B&B aperto solo nei mesi estivi o nei weekend, un registratore di cassa telematico è uno spreco: paghi canone tutto l'anno per usarlo poche settimane. Con ScontrinoZero emetti lo scontrino al check-out dal telefono o dal tablet, e paghi solo quando ti serve. Stagione finita? Disdici e riattiva quando vuoi — lo storico resta sempre accessibile sul tuo account.",
    obligations: [
      "Emissione del Documento Commerciale Online per il servizio di pernottamento (aliquota IVA 10%).",
      "Imposta di soggiorno (dove applicata) calcolata separatamente, non soggetta a IVA.",
      "Comunicazione presenze al portale ISTAT/regionale e alla Questura (separati dallo scontrino).",
      "Trasmissione corrispettivi entro 12 giorni dall'operazione.",
    ],
    benefits: [
      "Niente canone fisso annuale: paghi solo quando emetti scontrini.",
      "Configurazione una tantum di aliquota e voci ricorrenti (pernottamento, colazione, supplementi).",
      "Storico ordinato per stagione, utile per dichiarazione dei redditi e analisi.",
      "Funziona su qualsiasi smartphone o tablet, anche quello che già usi per ricevere gli ospiti.",
    ],
    faq: [
      {
        question: "L'imposta di soggiorno va indicata sullo scontrino?",
        answer:
          "L'imposta di soggiorno non è soggetta a IVA e va indicata separatamente sul documento commerciale come voce non concorrente al totale imponibile. ScontrinoZero supporta righe non imponibili per gestirla correttamente.",
      },
      {
        question: "Cosa succede in bassa stagione quando non emetto scontrini?",
        answer:
          "Niente di particolare: l'abbonamento prosegue al costo del piano scelto. Se preferisci, puoi disdire e riattivare l'abbonamento a inizio stagione successiva senza perdere i dati storici.",
      },
      {
        question:
          "Va bene per affittacamere non imprenditoriale (codice ATECO 55.20.51)?",
        answer:
          "Sì, purché tu sia titolare di partita IVA e abbia credenziali Fisconline attive. L'obbligo di emissione del documento commerciale dipende dalla forma di esercizio: verifica con il commercialista se rientri nei casi obbligati.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "intestazione-scontrino"],
  },
  "regime-forfettario": {
    slug: "regime-forfettario",
    title: "Scontrino elettronico in regime forfettario",
    metaTitle: "Scontrino elettronico in regime forfettario | ScontrinoZero",
    metaDescription:
      "Sei in regime forfettario? Emetti scontrini verso privati senza IVA e senza registratore fisico. Soluzione più economica del mercato, da €2,50/mese.",
    heroSubtitle:
      "Soluzione più economica per i forfettari: zero IVA, zero hardware, costo mensile minimo. Solo lo smartphone che hai già.",
    audience:
      "partite IVA in regime forfettario (L. 190/2014) con vendite o servizi B2C",
    useCase:
      "Il regime forfettario non ti esonera dall'emissione del documento commerciale quando vendi a privati. Ma non ha senso pagare centinaia di euro per un registratore di cassa telematico se il tuo volume di scontrini è modesto. ScontrinoZero applica automaticamente la natura N2.2 (non soggetto IVA — regime forfettario) e ti fa risparmiare sull'hardware.",
    obligations: [
      "Emissione del Documento Commerciale Online verso privati anche in regime forfettario.",
      "Indicazione della natura N2.2 sullo scontrino (operazione non soggetta IVA, art. 1 c. 54-89 L. 190/2014).",
      "Trasmissione corrispettivi all'Agenzia delle Entrate entro 12 giorni.",
      "Limite di ricavi €85.000/anno per restare nel regime forfettario.",
    ],
    benefits: [
      "Selezione guidata della natura N2.2 in fase di onboarding, pre-configurata sugli scontrini.",
      "Costo mensile più basso del mercato: a partire da €2,50/mese (annuale).",
      "Zero hardware da acquistare: solo lo smartphone che già hai.",
      "Storico ordinato e ricercabile; export CSV in arrivo sul piano Pro.",
    ],
    faq: [
      {
        question: "In forfettario devo davvero emettere scontrino?",
        answer:
          "Sì, se vendi beni o servizi a privati e non emetti fattura. Il regime forfettario riguarda la fiscalità (IVA, IRPEF), non l'obbligo di documentare la transazione. Lo scontrino senza IVA, con natura N2.2, è la forma corretta.",
      },
      {
        question: "Cosa cambia se supero gli €85.000 di ricavi?",
        answer:
          "Esci dal regime forfettario e applichi l'IVA ordinaria dall'anno successivo (o subito se superi €100.000). ScontrinoZero supporta entrambi i regimi: per cambiare l'aliquota prevalente dopo l'onboarding contatta il supporto (un'autonoma riconfigurazione da Impostazioni è prevista in una versione futura).",
      },
      {
        question: "Devo applicare la marca da bollo da €2 sullo scontrino?",
        answer:
          "La marca da bollo da €2 si applica alle fatture in forfettario per importi superiori a €77,47, non agli scontrini. Sul documento commerciale (scontrino) non si applica bollo.",
      },
    ],
    relatedHelp: ["regime-forfettario", "aliquote-iva", "primo-scontrino"],
  },
  professionisti: {
    slug: "professionisti",
    title: "Scontrino elettronico per liberi professionisti",
    metaTitle:
      "Scontrino elettronico per liberi professionisti | ScontrinoZero",
    metaDescription:
      "Quando un professionista deve emettere scontrino e quando fattura? Guida pratica e soluzione mobile per chi incassa al momento. Da €2,50/mese.",
    heroSubtitle:
      "Consulenti, tutor, personal trainer, fotografi: quando incassi al momento da un privato, ti serve uno strumento veloce per documentare la prestazione.",
    audience:
      "liberi professionisti con prestazioni B2C: consulenti, tutor, personal trainer, fotografi",
    useCase:
      "Molti professionisti emettono fattura, ma per le prestazioni B2C incassate al momento (lezione privata, sessione di personal training, consulenza spot, set fotografico) lo scontrino elettronico è più rapido e adatto. ScontrinoZero ti permette di scegliere caso per caso: emetti scontrino quando il cliente paga subito, fattura tradizionale quando serve a un'azienda.",
    obligations: [
      "Obbligo di documentare ogni prestazione verso privato: fattura o documento commerciale (DPR 633/72 art. 22).",
      "Applicazione dell'aliquota IVA propria della prestazione (22% per la maggior parte delle consulenze; verifica casi specifici).",
      "Per i professionisti iscritti a ordini con cassa propria: contributo integrativo gestito a parte rispetto allo scontrino.",
      "Trasmissione corrispettivi all'Agenzia delle Entrate entro 12 giorni.",
    ],
    benefits: [
      "Una sola app per gestire scontrini e storico, separata dal gestionale fatture.",
      "Emissione veloce in mobilità: a fine sessione, dal telefono, senza tornare in studio.",
      "Storico consultabile; export CSV da consegnare al commercialista in arrivo sul piano Pro.",
      "Costo contenuto: meno di una cena al ristorante al mese per il piano Starter.",
    ],
    faq: [
      {
        question: "Un libero professionista deve emettere scontrino o fattura?",
        answer:
          "Dipende. Se la prestazione è documentata con fattura elettronica (richiesta dal cliente o per scelta), lo scontrino non è dovuto. Per gli incassi B2C dove il cliente non chiede fattura, il documento commerciale (scontrino) è la forma più rapida.",
      },
      {
        question:
          "Sono iscritto a un ordine professionale: ScontrinoZero va bene?",
        answer:
          "Sì, se sei titolare di partita IVA con credenziali Fisconline. Verifica con il tuo ordine se ci sono obblighi specifici di emissione fattura per tutte le prestazioni: in quel caso lo scontrino non è applicabile e ti serve un gestionale di fatturazione.",
      },
      {
        question:
          "Posso usarlo per prestazioni occasionali con ritenuta d'acconto?",
        answer:
          "No. La prestazione occasionale (con ricevuta soggetta a ritenuta d'acconto) non rientra nel perimetro del documento commerciale. ScontrinoZero è pensato per chi ha partita IVA attiva.",
      },
    ],
    relatedHelp: [
      "primo-scontrino",
      "regime-forfettario",
      "fatture-e-ricevute",
    ],
  },
};

const CATEGORY_SLUG_SET: ReadonlySet<string> = new Set(categorySlugs);

export function isCategorySlug(slug: string): slug is CategorySlug {
  return CATEGORY_SLUG_SET.has(slug);
}

export function getCategory(slug: string): CategoryContent {
  if (!isCategorySlug(slug)) {
    throw new Error(`Unknown category slug: ${slug}`);
  }
  return categories[slug];
}
