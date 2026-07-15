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
  | "professionisti"
  | "officine-meccanici"
  | "eventi-mercatini-hobbisti"
  | "palestre-personal-trainer"
  | "food-truck"
  | "ncc-taxi"
  | "tatuatori-piercer";

export const categorySlugs: readonly CategorySlug[] = [
  "ambulanti",
  "parrucchieri-estetisti",
  "artigiani",
  "b-and-b",
  "regime-forfettario",
  "professionisti",
  "officine-meccanici",
  "eventi-mercatini-hobbisti",
  "palestre-personal-trainer",
  "food-truck",
  "ncc-taxi",
  "tatuatori-piercer",
];

export const categories: Record<CategorySlug, CategoryContent> = {
  ambulanti: {
    slug: "ambulanti",
    title: "Registratore di cassa per ambulanti e mercati",
    metaTitle: "Registratore di cassa per ambulanti e mercati",
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
          "Sì. Il regime forfettario non esonera dall'emissione del documento commerciale verso privati. Con ScontrinoZero imposti la natura N2 (operazioni non soggette) come aliquota prevalente e gli scontrini escono senza IVA, come previsto per il forfettario.",
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
    title: "Scontrino elettronico per parrucchieri ed estetisti",
    metaTitle: "Scontrino elettronico per parrucchieri ed estetisti",
    metaDescription:
      "Gestisci scontrini e incassi del salone da tablet o smartphone. Senza registratore sul banco, senza canoni. Da €2,50/mese, prova 30 giorni gratis.",
    heroSubtitle:
      "Emetti scontrini dal tablet alla reception o dallo smartphone in cabina, senza ingombrare il banco con un registratore fisico.",
    audience: "parrucchieri, estetisti e operatori dei servizi alla persona",
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
          "No. Per chi vende pochi prodotti il catalogo manuale è sufficiente. Il barcode scanner via fotocamera è una delle feature in roadmap per le prossime versioni.",
      },
      {
        question: "Posso stampare lo scontrino su carta?",
        answer:
          "Lo scontrino è digitale per natura. Puoi consegnarlo via link/QR oppure stamparlo su carta termica con una stampante Bluetooth 58/80mm (supporto nativo in arrivo). Già oggi puoi salvare il PDF e stamparlo da qualsiasi stampante collegata al dispositivo.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "intestazione-scontrino"],
  },
  artigiani: {
    slug: "artigiani",
    title: "Scontrino elettronico per artigiani e installatori",
    metaTitle: "Scontrino elettronico per artigiani e installatori",
    metaDescription:
      "Idraulici, elettricisti, falegnami: emetti lo scontrino direttamente dal cantiere o dal furgone, con lo smartphone. Da €2,50/mese, 30 giorni gratis.",
    heroSubtitle:
      "Emetti lo scontrino dal cantiere, dal furgone o dal laboratorio. Niente registratore in officina, niente carta che si perde.",
    audience: "artigiani: idraulici, elettricisti, falegnami, muratori",
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
          "ScontrinoZero richiede partita IVA attiva e le credenziali per l'Agenzia delle Entrate (Fisconline o CIE). La prestazione occasionale non è il caso d'uso target, perché non rientra negli obblighi di emissione del documento commerciale.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "annullare-scontrino"],
  },
  "b-and-b": {
    slug: "b-and-b",
    title: "Scontrino elettronico per B&B e strutture ricettive",
    metaTitle: "Scontrino elettronico per B&B e affittacamere",
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
          "Va bene per affittacamere non imprenditoriale (codice ATECO 55.20.51, il codice di attività delle case e camere per vacanze)?",
        answer:
          "Sì, purché tu sia titolare di partita IVA e abbia le credenziali AdE attive (Fisconline o CIE). L'obbligo di emissione del documento commerciale dipende dalla forma di esercizio: verifica con il commercialista se rientri nei casi obbligati.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "intestazione-scontrino"],
  },
  "regime-forfettario": {
    slug: "regime-forfettario",
    title: "Scontrino elettronico in regime forfettario",
    metaTitle: "Scontrino elettronico in regime forfettario",
    metaDescription:
      "Sei in regime forfettario? Emetti scontrini verso privati senza IVA e senza registratore fisico. Soluzione più economica del mercato, da €2,50/mese.",
    heroSubtitle:
      "Soluzione più economica per i forfettari: zero IVA, zero hardware, costo mensile minimo. Solo lo smartphone che hai già.",
    audience:
      "partite IVA in regime forfettario (L. 190/2014) con vendite o servizi B2C",
    useCase:
      "Il regime forfettario non ti esonera dall'emissione del documento commerciale quando vendi a privati. Ma non ha senso pagare centinaia di euro per un registratore di cassa telematico se il tuo volume di scontrini è modesto. Con ScontrinoZero imposti come aliquota prevalente la natura N2 (il codice IVA delle operazioni non soggette del forfettario, da indicare al posto dell'aliquota) e risparmi sull'hardware.",
    obligations: [
      "Emissione del Documento Commerciale Online verso privati anche in regime forfettario.",
      "Indicazione della natura N2 sullo scontrino (operazione non soggetta IVA, art. 1 c. 54-89 L. 190/2014).",
      "Trasmissione corrispettivi all'Agenzia delle Entrate entro 12 giorni.",
      "Limite di ricavi €85.000/anno per restare nel regime forfettario.",
    ],
    benefits: [
      "Natura N2 impostabile come aliquota prevalente in onboarding, così è già pre-compilata sugli scontrini.",
      "Costo mensile più basso del mercato: a partire da €2,50/mese (annuale).",
      "Zero hardware da acquistare: solo lo smartphone che già hai.",
      "Storico ordinato e ricercabile; export CSV sul piano Pro.",
    ],
    faq: [
      {
        question: "In forfettario devo davvero emettere scontrino?",
        answer:
          "Sì, se vendi beni o servizi a privati e non emetti fattura. Il regime forfettario riguarda la fiscalità (IVA, IRPEF), non l'obbligo di documentare la transazione. Lo scontrino senza IVA, con natura N2, è la forma corretta.",
      },
      {
        question: "Cosa cambia se supero gli €85.000 di ricavi?",
        answer:
          "Esci dal regime forfettario e applichi l'IVA ordinaria dall'anno successivo (o subito se superi €100.000). ScontrinoZero supporta entrambi i regimi: puoi cambiare l'aliquota IVA prevalente in qualsiasi momento da Impostazioni → Attività → Modifica.",
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
    metaTitle: "Scontrino elettronico per liberi professionisti",
    metaDescription:
      "Quando un professionista deve emettere scontrino e quando fattura? Guida pratica e soluzione mobile per chi incassa al momento. Da €2,50/mese.",
    heroSubtitle:
      "Consulenti, tutor, fotografi, formatori: quando incassi al momento da un privato, ti serve uno strumento veloce per documentare la prestazione.",
    audience:
      "liberi professionisti con prestazioni B2C: consulenti, tutor, fotografi, formatori",
    useCase:
      "Molti professionisti emettono fattura, ma per le prestazioni B2C incassate al momento (lezione privata, consulenza spot, set fotografico) lo scontrino elettronico è più rapido e adatto. ScontrinoZero ti permette di scegliere caso per caso: emetti scontrino quando il cliente paga subito, fattura tradizionale quando serve a un'azienda.",
    obligations: [
      "Obbligo di documentare ogni prestazione verso privato: fattura o documento commerciale (DPR 633/72 art. 22).",
      "Applicazione dell'aliquota IVA propria della prestazione (22% per la maggior parte delle consulenze; verifica casi specifici).",
      "Se sei iscritto a un ordine professionale con una cassa di previdenza propria (es. avvocati, geometri, architetti), il contributo da versare alla cassa si gestisce a parte rispetto allo scontrino.",
      "Trasmissione corrispettivi all'Agenzia delle Entrate entro 12 giorni.",
    ],
    benefits: [
      "Una sola app per gestire scontrini e storico, separata dal gestionale fatture.",
      "Emissione veloce in mobilità: a fine sessione, dal telefono, senza tornare in studio.",
      "Storico consultabile; export CSV da consegnare al commercialista sul piano Pro.",
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
          "Sì, se sei titolare di partita IVA con credenziali AdE (Fisconline o CIE). Verifica con il tuo ordine se ci sono obblighi specifici di emissione fattura per tutte le prestazioni: in quel caso lo scontrino non è applicabile e ti serve un gestionale di fatturazione.",
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
  "officine-meccanici": {
    slug: "officine-meccanici",
    title: "Scontrino elettronico per officine e meccanici",
    metaTitle: "Scontrino elettronico per officine e meccanici",
    metaDescription:
      "Emetti lo scontrino elettronico in officina da smartphone o tablet: ricambi e manodopera nello stesso documento, senza registratore di cassa. Da €2,50/mese.",
    heroSubtitle:
      "Fine intervento, scontrino subito: dall'accettazione o dal ponte, con il tablet o lo smartphone che hai già in officina.",
    audience: "officine meccaniche, gommisti, elettrauto e carrozzerie",
    useCase:
      "Tagliando finito, cliente alla cassa: lo scontrino deve uscire subito, tra una telefonata e un'auto sul ponte. ScontrinoZero trasforma il tablet dell'accettazione (o lo smartphone in tasca) nel registratore di cassa dell'officina: righe separate per ricambi e manodopera, scontrino consegnato via link, QR o PDF, corrispettivi trasmessi all'Agenzia delle Entrate in automatico.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni riparazione o vendita pagata da un privato in officina (DPR 633/72 art. 22).",
      "IVA al 22% sulla prestazione di riparazione; i ricambi impiegati nell'intervento seguono l'aliquota della prestazione.",
      "Trasmissione telematica dei corrispettivi all'Agenzia delle Entrate entro 12 giorni dall'operazione.",
      "Fattura elettronica al posto dello scontrino quando il cliente la richiede (es. veicolo aziendale, deducibilità dei costi).",
    ],
    benefits: [
      'Catalogo di interventi ricorrenti ("tagliando", "cambio gomme", "ricarica clima") per emettere in 2 tap.',
      "Righe multiple nello stesso scontrino: manodopera, ricambi e materiali di consumo, ognuna con la sua descrizione.",
      "Annullamento conforme dello scontrino sbagliato, direttamente dall'app.",
      "Storico centralizzato: ritrovi lo scontrino di un intervento anche a distanza di mesi, utile per contestazioni e garanzie.",
    ],
    faq: [
      {
        question: "Ricambi e manodopera vanno nello stesso scontrino?",
        answer:
          "Sì. Puoi aggiungere più righe nello stesso documento: manodopera, ricambi e materiali, ognuna con descrizione e importo propri. Quando i ricambi sono parte integrante della riparazione, l'aliquota è quella della prestazione (22%).",
      },
      {
        question:
          "Il cliente ha un'auto aziendale e chiede fattura: come funziona?",
        answer:
          "Se per l'intervento emetti fattura elettronica, lo scontrino non è dovuto. ScontrinoZero copre gli incassi da privati che pagano al momento senza chiedere fattura; per le fatture continui a usare il tuo gestionale.",
      },
      {
        question: "Ho sbagliato importo sullo scontrino: posso annullarlo?",
        answer:
          "Sì. Puoi annullare lo scontrino direttamente dall'app: l'annullamento viene trasmesso all'Agenzia delle Entrate in modo conforme e puoi riemettere subito il documento corretto.",
      },
    ],
    relatedHelp: [
      "primo-scontrino",
      "annullare-scontrino",
      "fatture-e-ricevute",
    ],
  },
  "eventi-mercatini-hobbisti": {
    slug: "eventi-mercatini-hobbisti",
    title: "Scontrino elettronico per eventi, mercatini e hobbisti",
    metaTitle: "Scontrino elettronico per eventi, mercatini e hobbisti",
    metaDescription:
      "Vendi a eventi, fiere e mercatini? Emetti scontrini elettronici dallo smartphone, senza registratore da trasportare. Ideale per attività stagionali. Da €2,50/mese.",
    heroSubtitle:
      "Stand alla fiera, banchetto al mercatino o all'evento del weekend: lo scontrino esce dallo smartphone, senza hardware da trasportare.",
    audience:
      "espositori a eventi e fiere, venditori ai mercatini, hobbisti passati a partita IVA",
    useCase:
      "Chi vende a eventi, fiere e mercatini lavora a weekend e stagioni: pagare un registratore telematico tutto l'anno non ha senso. Con ScontrinoZero emetti il documento commerciale dallo smartphone con la normale connessione 4G/5G, e se l'attività si ferma nei mesi invernali puoi disdire e riattivare quando riparte, senza perdere lo storico.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni vendita B2C se operi con partita IVA, anche a eventi e mercatini occasionali (DPR 633/72 art. 22).",
      "Trasmissione telematica dei corrispettivi all'Agenzia delle Entrate entro 12 giorni dall'operazione.",
      "Partita IVA obbligatoria quando la vendita diventa abituale: i limiti per gli hobbisti senza P.IVA sono fissati dai regolamenti regionali dei mercatini.",
      "Autorizzazione comunale o concessione di posteggio per la vendita su area pubblica (adempimento separato da quello fiscale).",
    ],
    benefits: [
      "Zero hardware da montare allo stand: basta lo smartphone, anche con connessione mobile.",
      "Piano mensile disdicibile: paghi nei mesi in cui vendi, lo storico resta sempre accessibile.",
      "Catalogo con i tuoi articoli ricorrenti per emettere in pochi tap anche con la fila al banchetto.",
      "Pagamenti misti contanti + carta gestiti nello stesso scontrino.",
    ],
    faq: [
      {
        question:
          "Sono un hobbista senza partita IVA: devo emettere scontrino?",
        answer:
          "No. La vendita occasionale da hobbista, nei limiti dei regolamenti regionali dei mercatini, non richiede il documento commerciale. Se però l'attività diventa abituale scatta l'obbligo di partita IVA: da quel momento ScontrinoZero è il modo più economico per metterti in regola.",
      },
      {
        question:
          "Partecipo solo a qualche evento all'anno: conviene un abbonamento?",
        answer:
          "Sì, perché non c'è vincolo annuale: attivi il piano mensile nei mesi degli eventi e lo disdici quando l'attività si ferma. I dati e lo storico restano nel tuo account e li ritrovi alla riattivazione.",
      },
      {
        question: "Alla fiera la connessione è debole: riesco a emettere?",
        answer:
          "Per l'emissione serve una connessione attiva al momento della vendita, perché il numero progressivo arriva dall'Agenzia delle Entrate: una normale copertura 4G o un hotspot dal telefono sono sufficienti.",
      },
    ],
    relatedHelp: ["primo-scontrino", "installare-app", "regime-forfettario"],
  },
  "palestre-personal-trainer": {
    slug: "palestre-personal-trainer",
    title: "Scontrino elettronico per palestre e personal trainer",
    metaTitle: "Scontrino elettronico per palestre e personal trainer",
    metaDescription:
      "Abbonamenti, ingressi e sedute di personal training: emetti lo scontrino elettronico dal front desk o a bordo sala, senza registratore. Da €2,50/mese.",
    heroSubtitle:
      "Incassa abbonamenti, ingressi e pacchetti lezioni dal front desk o a bordo sala: il registratore di cassa è lo smartphone che hai già.",
    audience:
      "palestre, studi fitness, personal trainer e istruttori con partita IVA",
    useCase:
      "In palestra il pagamento avviene al front desk tra un ingresso e l'altro; il personal trainer incassa a fine sessione, magari al parco o a domicilio del cliente. In entrambi i casi ScontrinoZero emette il documento commerciale in pochi tap da smartphone o tablet, con abbonamenti e pacchetti già configurati a catalogo, e trasmette i corrispettivi all'Agenzia delle Entrate in automatico.",
    obligations: [
      "Emissione del Documento Commerciale Online per abbonamenti, ingressi e lezioni pagati da privati (DPR 633/72 art. 22).",
      "IVA al 22% sui servizi fitness resi in forma commerciale (ditta individuale, società, libero professionista).",
      "Regole proprie per ASD/SSD in regime L. 398/91: i corrispettivi istituzionali verso i tesserati seguono una disciplina diversa — verifica con il commercialista.",
      "Trasmissione telematica dei corrispettivi entro 12 giorni dall'incasso.",
    ],
    benefits: [
      "Abbonamenti, ingressi singoli e pacchetti lezioni configurati una volta a catalogo, scontrino in 2 tap.",
      "Il personal trainer emette ovunque si alleni il cliente: parco, domicilio, studio.",
      "Storico incassi ordinato per giorno e per prodotto, utile per capire cosa vende di più.",
      "Zero hardware al front desk: niente registratore, solo il tablet o lo smartphone.",
    ],
    faq: [
      {
        question:
          "Sono un personal trainer in regime forfettario: come esce lo scontrino?",
        answer:
          "Imposti la natura N2 (operazioni non soggette) come aliquota prevalente e gli scontrini escono senza IVA, come previsto per il forfettario. È la configurazione più comune tra trainer e istruttori a partita IVA individuale.",
      },
      {
        question: "Gestisco una ASD/SSD: devo emettere scontrino?",
        answer:
          "Dipende. I corrispettivi istituzionali incassati dai tesserati in regime L. 398/91 possono essere decommercializzati e non richiedere il documento commerciale; le attività commerciali (es. servizi a non tesserati, vendita di prodotti) vanno invece certificate. Verifica il tuo caso con il commercialista.",
      },
      {
        question: "Posso vendere pacchetti da 10 lezioni?",
        answer:
          "Sì. Il pacchetto è una voce di catalogo come le altre: lo configuri una volta con prezzo e descrizione e lo scontrino esce al momento dell'incasso. Il piano Starter include fino a 5 prodotti a catalogo, il Pro è illimitato.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "storico-ed-esportazione"],
  },
  "food-truck": {
    slug: "food-truck",
    title: "Scontrino elettronico per food truck e street food",
    metaTitle: "Scontrino elettronico per food truck e street food",
    metaDescription:
      "Street food dal furgone o dal chiosco: scontrino elettronico dallo smartphone, aliquote IVA per riga e corrispettivi automatici. Da €2,50/mese, 30 giorni gratis.",
    heroSubtitle:
      "Dal festival al mercato serale: scontrini a raffica dallo smartphone o dal tablet in cucina, senza registratore nel furgone.",
    audience:
      "food truck, street food, chioschi e banchi gastronomici itineranti",
    useCase:
      "Nel food truck lo spazio è poco e la fila non aspetta: il registratore telematico è un ingombro in più che va alimentato e mantenuto. Con ScontrinoZero il telefono (o il tablet fissato in cucina) emette il documento commerciale in due tap, con il menu a catalogo e le aliquote IVA giuste per ogni riga, e i corrispettivi partono verso l'Agenzia delle Entrate in automatico.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni vendita, anche di piccolo importo (DPR 633/72 art. 22).",
      "IVA al 10% per la somministrazione di alimenti e bevande (Tab. A, parte III, DPR 633/72); per la vendita da asporto vale l'aliquota propria di ciascun prodotto.",
      "Trasmissione telematica dei corrispettivi entro 12 giorni dall'operazione.",
      "SCIA, requisiti HACCP e concessioni di posteggio: adempimenti separati da quello fiscale.",
    ],
    benefits: [
      "Menu a catalogo: panino, fritto e bibita già configurati, scontrino in 2 tap anche con la fila.",
      "Aliquote diverse nella stessa vendita: somministrazione al 10% e prodotti al 22% convivono nello stesso scontrino.",
      "Funziona con la connessione 4G/5G del telefono: nessuna linea fissa, nessun hardware dedicato.",
      "Storico per giornata: sai subito quanto ha incassato ogni piazza o evento.",
    ],
    faq: [
      {
        question: "Che aliquota IVA applico: 10% o 22%?",
        answer:
          "La somministrazione di alimenti e bevande (consumo sul posto) è al 10%. Per la vendita da asporto si applica l'aliquota propria di ciascun prodotto: molti alimenti preparati restano al 10%, alcune bevande sono al 22%. ScontrinoZero permette aliquote diverse riga per riga; per i casi limite chiedi al commercialista.",
      },
      {
        question: "A fine serata devo fare la chiusura di cassa?",
        answer:
          "No. Con il Documento Commerciale Online i corrispettivi vengono trasmessi all'Agenzia delle Entrate a ogni emissione: non c'è la chiusura giornaliera obbligatoria del registratore telematico. Nello storico vedi comunque il totale incassato per giornata.",
      },
      {
        question: "Serve una stampante o basta il QR?",
        answer:
          "Nessuna stampante obbligatoria: lo scontrino si consegna via link o QR e il cliente lo apre sul telefono. Se preferisci la carta, puoi salvare il PDF e stamparlo con una stampante collegata al dispositivo.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "chiusura-giornaliera"],
  },
  "ncc-taxi": {
    slug: "ncc-taxi",
    title: "Scontrino elettronico per NCC e taxi",
    metaTitle: "Scontrino elettronico per NCC e taxi",
    metaDescription:
      "Ricevuta immediata a fine corsa: emetti il documento commerciale dallo smartphone e consegnalo via link o QR, senza hardware a bordo. Da €2,50/mese.",
    heroSubtitle:
      "Il cliente scende e vuole la ricevuta per la nota spese: emettila dallo smartphone e consegnala via link o QR prima che chiuda la portiera.",
    audience:
      "conducenti NCC, tassisti e piccole imprese di noleggio con conducente",
    useCase:
      "Per chi guida, la burocrazia dev'essere veloce: niente blocchetti, niente hardware a bordo. Con ScontrinoZero emetti il documento commerciale dallo smartphone a fine corsa e lo consegni via link o QR. Il cliente business che vuole la fattura resta servito dal tuo gestionale di fatturazione; per tutte le altre corse pagate al momento, lo scontrino digitale è la via più rapida.",
    obligations: [
      "Corse urbane in taxi: prestazioni esenti IVA (art. 10, n. 14, DPR 633/72 — trasporto urbano di persone con veicoli da piazza).",
      "Servizio NCC: IVA al 10% come trasporto di persone (Tab. A, parte III, DPR 633/72).",
      "Il trasporto di persone rientra in specifici esoneri dalla certificazione dei corrispettivi (DPR 696/1996): verifica con il commercialista se e come il tuo servizio vi ricade.",
      "Fattura elettronica quando il cliente la richiede (trasferte aziendali, deducibilità dei costi).",
    ],
    benefits: [
      "Emissione a fine corsa in pochi secondi, direttamente dal telefono già montato sul cruscotto.",
      "Consegna digitale via link o QR: perfetta per i clienti in trasferta che vogliono la ricevuta subito.",
      "Tariffe ricorrenti a catalogo (aeroporto, stazione, tratta fissa) per non digitare gli importi ogni volta.",
      "Storico delle corse incassate consultabile dal commercialista, senza fogli in giro per l'auto.",
    ],
    faq: [
      {
        question: "Taxi e NCC non sono esonerati dallo scontrino?",
        answer:
          "In molti casi sì: il trasporto di persone rientra negli esoneri dalla certificazione dei corrispettivi previsti dal DPR 696/1996. L'esonero però è una facoltà, non un divieto: puoi comunque emettere il documento commerciale per dare al cliente una ricevuta immediata e tenere uno storico incassi ordinato. Verifica il tuo inquadramento con il commercialista.",
      },
      {
        question: "Come consegno la ricevuta al cliente in auto?",
        answer:
          "Via link o QR code: il cliente lo inquadra dal sedile e ha subito il documento sul telefono, pronto da allegare alla nota spese. Niente stampante a bordo; se serve la carta, il PDF si stampa da qualsiasi stampante.",
      },
      {
        question:
          "Le corse in taxi sono esenti IVA: lo scontrino esce corretto?",
        answer:
          "Sì. Sulle righe puoi impostare la natura IVA corretta (es. N4 per le operazioni esenti): l'importo esce senza IVA e il documento trasmesso all'Agenzia delle Entrate riporta la natura giusta.",
      },
    ],
    relatedHelp: ["primo-scontrino", "aliquote-iva", "fatture-e-ricevute"],
  },
  "tatuatori-piercer": {
    slug: "tatuatori-piercer",
    title: "Scontrino elettronico per tatuatori e piercer",
    metaTitle: "Scontrino elettronico per tatuatori e piercer",
    metaDescription:
      "Studio tattoo o piercing: emetti scontrini per sedute e acconti direttamente dallo smartphone, senza registratore sul bancone. Da €2,50/mese, 30 giorni gratis.",
    heroSubtitle:
      "Chiudi la seduta e incassa: lo scontrino esce dal telefono, anche per l'acconto alla prenotazione. Niente registratore sul bancone dello studio.",
    audience: "tatuatori, piercer e studi di tattoo e body piercing",
    useCase:
      "In studio si lavora su appuntamento, spesso con acconto alla prenotazione e saldo a fine seduta. ScontrinoZero segue proprio questo flusso: emetti lo scontrino dell'acconto quando il cliente prenota e quello del saldo a lavoro finito, tutto dallo smartphone o dal tablet, con i corrispettivi trasmessi all'Agenzia delle Entrate in automatico.",
    obligations: [
      "Emissione del Documento Commerciale Online per ogni seduta o vendita pagata da un privato (DPR 633/72 art. 22).",
      "IVA al 22% sulle prestazioni di tatuaggio e piercing; natura N2 senza IVA per chi è in regime forfettario.",
      "Certificazione dell'acconto al momento dell'incasso, non alla data della seduta.",
      "Trasmissione telematica dei corrispettivi entro 12 giorni dall'operazione.",
      "Requisiti igienico-sanitari e comunicazioni ASL secondo le norme regionali (adempimenti separati da quello fiscale).",
    ],
    benefits: [
      "Acconti e saldi gestiti come scontrini separati, ognuno emesso al momento dell'incasso.",
      'Catalogo con le tue prestazioni ricorrenti ("seduta piccola", "flash", "piercing lobo") per emettere in 2 tap.',
      "Annullamento conforme se la seduta salta e restituisci l'acconto.",
      "Storico ordinato per il commercialista, senza scatole di ricevute in studio.",
    ],
    faq: [
      {
        question: "Devo emettere scontrino anche sull'acconto?",
        answer:
          "Sì. Il corrispettivo si certifica al momento dell'incasso: quando il cliente versa l'acconto alla prenotazione emetti lo scontrino per quell'importo, e a fine seduta emetti quello del saldo. Fa eccezione la caparra confirmatoria pura, che ha natura risarcitoria: per distinguere i casi chiedi al commercialista.",
      },
      {
        question:
          "Sono in regime forfettario come molti tatuatori: cambia qualcosa?",
        answer:
          "Solo l'aliquota: imposti la natura N2 (operazioni non soggette) come prevalente e gli scontrini escono senza IVA. L'obbligo di emettere il documento commerciale verso i privati resta anche in forfettario.",
      },
      {
        question:
          "Il cliente disdice e restituisco l'acconto: come sistemo lo scontrino?",
        answer:
          "Annulli lo scontrino dell'acconto direttamente dall'app: l'annullamento viene trasmesso all'Agenzia delle Entrate in modo conforme e lo storico resta coerente con quanto hai effettivamente incassato.",
      },
    ],
    relatedHelp: [
      "primo-scontrino",
      "annullare-scontrino",
      "regime-forfettario",
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
