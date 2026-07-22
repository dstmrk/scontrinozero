export const guideSlugs = [
  "documento-commerciale-online",
  "scontrino-senza-registratore-di-cassa",
  "differenza-scontrino-ricevuta-fattura",
  "pos-rt-obbligo-2026",
  "scontrino-regime-forfettario",
  "migrare-da-registratore-telematico-a-software",
  "chiusura-giornaliera-corrispettivi",
  "annullare-scontrino-elettronico",
  "lotteria-scontrini-commerciante",
  "scegliere-software-scontrini-elettronici",
  "codici-natura-iva",
  "stampante-termica-wifi-scontrini",
] as const;

export type GuideSlug = (typeof guideSlugs)[number];

export interface GuideTable {
  readonly headers: readonly string[];
  /** Ogni riga deve avere lo stesso numero di celle di headers. */
  readonly rows: readonly (readonly string[])[];
}

/**
 * Screenshot inline opzionale di una sezione guida: stesso componente
 * presentazionale del /help (AppScreenshot in un `<figure>`). `width`/`height`
 * sono le dimensioni intrinseche del PNG in `public/screenshots/`.
 */
export interface GuideImage {
  /** Percorso root-absolute (es. "/screenshots/cassa-tastierino.png"). */
  readonly src: string;
  /** Testo alternativo descrittivo (italiano, SEO/accessibilità). */
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  /** Didascalia opzionale sotto lo screenshot. */
  readonly caption?: string;
}

export interface GuideSection {
  readonly heading: string;
  readonly body: string;
  /** Tabella opzionale renderizzata dopo il body (es. codici natura N1-N7). */
  readonly table?: GuideTable;
  /** Screenshot inline opzionale renderizzato dopo body/tabella. */
  readonly image?: GuideImage;
}

export interface GuideFaq {
  readonly question: string;
  readonly answer: string;
}

export interface GuideArticle {
  readonly slug: GuideSlug;
  readonly title: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly heroIntro: string;
  /** Data ISO YYYY-MM-DD: finisce in Article JSON-LD e sitemap, mai troncarla al mese. */
  readonly publishedAt: string;
  /** Data ISO YYYY-MM-DD dell'ultima revisione sostanziale (>= publishedAt). */
  readonly updatedAt: string;
  readonly readingMinutes: number;
  readonly sections: readonly GuideSection[];
  readonly faq: readonly GuideFaq[];
  readonly relatedHelp: readonly string[];
  readonly relatedGuides: readonly GuideSlug[];
  /** Slug di /strumenti collegati (cross-link del cluster, es. forfettario). */
  readonly relatedTools?: readonly string[];
}

export const guideArticles: Record<GuideSlug, GuideArticle> = {
  "documento-commerciale-online": {
    slug: "documento-commerciale-online",
    title: "Documento commerciale online: cos'è e come funziona",
    metaTitle: "Documento commerciale online: cos'è e a cosa serve",
    metaDescription:
      "Cos'è il documento commerciale online (DCO), come si emette dal portale Fatture e Corrispettivi, base normativa e differenze rispetto al registratore telematico.",
    heroIntro:
      'Il documento commerciale online (DCO) è la versione digitale dello scontrino: lo si emette dal portale Agenzia delle Entrate "Fatture e Corrispettivi" senza bisogno di un registratore telematico fisico. È fiscalmente equivalente allo scontrino stampato e trasmette i corrispettivi all\'AdE in tempo reale.',
    publishedAt: "2026-05-14",
    updatedAt: "2026-05-14",
    readingMinutes: 6,
    sections: [
      {
        heading: "Cos'è il documento commerciale online",
        body: 'Il documento commerciale online (DCO) è uno scontrino elettronico emesso direttamente dal portale "Fatture e Corrispettivi" dell\'Agenzia delle Entrate o da un software collegato. Sostituisce lo scontrino emesso da un registratore telematico, ed è fiscalmente equivalente a tutti gli effetti. Contiene gli stessi dati: progressivo, data e ora, dettaglio articoli, aliquote IVA, totale e – se richiesto – il codice lotteria del cliente.',
      },
      {
        heading: "Base normativa",
        body: "Il DCO è disciplinato dal Provvedimento dell'Agenzia delle Entrate del 28 ottobre 2016 n. 182017 e successive modifiche, e dall'articolo 2 del D.Lgs. 127/2015 che ha introdotto l'obbligo della memorizzazione e trasmissione telematica dei corrispettivi. L'Interpello AdE n. 956-1523/2020 ha confermato che l'uso di software di terze parti come \"velocizzatori\" della procedura web è ammesso, purché rispetti le prescrizioni normative.",
      },
      {
        heading: "Quando si emette",
        body: "Va emesso al momento del pagamento per ogni vendita al consumatore finale (B2C). Non sostituisce la fattura elettronica B2B verso altre partite IVA: in quel caso si emette comunque fattura tramite SDI. Per le vendite occasionali o le prestazioni di servizio rese al pubblico, il DCO è il documento corretto.",
      },
      {
        heading: "Cosa contiene",
        body: "Un DCO riporta obbligatoriamente: ragione sociale e partita IVA dell'esercente, data e ora di emissione, numero progressivo annuale, descrizione dei beni o servizi venduti, prezzo unitario, quantità, aliquota IVA per riga, totale corrispettivo, eventuale codice lotteria del cliente. La trasmissione all'AdE avviene istantaneamente al momento della conferma di emissione.",
        image: {
          src: "/screenshots/documento-commerciale.png",
          alt: "Documento commerciale online con identificativo AdE, dettaglio articoli, aliquote IVA e totale",
          width: 661,
          height: 1188,
          caption:
            "Sul documento compaiono l'identificativo AdE, gli articoli con le aliquote IVA e il totale.",
        },
      },
      {
        heading: "Come si emette con ScontrinoZero",
        body: "ScontrinoZero replica in automatico la procedura ufficiale del portale dell'Agenzia delle Entrate: inserisci gli articoli nel carrello, scegli il metodo di pagamento, opzionalmente aggiungi il codice lotteria del cliente, e tocca \"Emetti\". Il documento viene generato, firmato con le tue credenziali dell'Agenzia delle Entrate, trasmesso al portale AdE e archiviato nel tuo storico digitale. Tutto in 3-5 secondi.",
      },
      {
        heading: "Vantaggi rispetto al registratore telematico",
        body: "Il DCO emesso da software elimina i costi hardware iniziali (€400-800 per un RT), il canone annuo di manutenzione (€100-200), il collaudo biennale obbligatorio e l'installazione da tecnico abilitato. In compenso richiede una connessione internet stabile e non è ottimale per attività con coda alla cassa: il vantaggio è massimo per attività mobili, stagionali o con volumi bassi/medi.",
      },
    ],
    faq: [
      {
        question:
          "Il documento commerciale online ha lo stesso valore dello scontrino del registratore telematico?",
        answer:
          "Sì. Sono fiscalmente equivalenti: stesso valore probatorio, stessi adempimenti di trasmissione, stessi diritti del cliente (garanzia, reso, lotteria). La differenza è solo nel mezzo di emissione: software vs hardware certificato.",
      },
      {
        question:
          "Serve ancora avere un registratore telematico se uso il DCO?",
        answer:
          "No, sono alternative. Se emetti tutti i corrispettivi tramite DCO da software, il registratore telematico non è necessario. Puoi tenerne uno fisico e affiancare il DCO per la mobilità, ma legalmente uno dei due basta.",
      },
      {
        question: "Posso emettere DCO anche in regime forfettario?",
        answer:
          "Sì. Il regime forfettario non esonera dall'obbligo di emettere il documento commerciale per le vendite B2C. Sul documento va indicata la natura N2 (operazione non soggetta IVA, art. 1 c. 54-89 L. 190/2014) al posto dell'aliquota — il codice granulare N2.2 vale solo per la fattura elettronica — ma lo scontrino va comunque emesso e trasmesso.",
      },
    ],
    relatedHelp: [
      "primo-scontrino",
      "come-collegare-ade",
      "regime-forfettario",
    ],
    relatedGuides: [
      "scontrino-senza-registratore-di-cassa",
      "differenza-scontrino-ricevuta-fattura",
    ],
  },

  "scontrino-senza-registratore-di-cassa": {
    slug: "scontrino-senza-registratore-di-cassa",
    title: "Emettere scontrino senza registratore di cassa: si può?",
    metaTitle: "Scontrino elettronico senza registratore di cassa: guida 2026",
    metaDescription:
      "Sì, si può: dal 2020 emetti scontrini elettronici senza registratore telematico, dal portale AdE o con un'app dal telefono. Cosa serve, costi e come iniziare.",
    heroIntro:
      "Sì, si può: da gennaio 2020 qualunque partita IVA può emettere lo scontrino elettronico senza registratore di cassa fisico, gratis dal portale \"Fatture e Corrispettivi\" dell'Agenzia delle Entrate oppure in pochi secondi con un'app dal telefono. Vediamo cosa serve, quanto costa e come scegliere l'app giusta.",
    publishedAt: "2026-05-14",
    updatedAt: "2026-07-13",
    readingMinutes: 8,
    sections: [
      {
        heading: "La premessa normativa",
        body: "Il D.Lgs. 127/2015 e il Provvedimento AdE del 28 ottobre 2016 hanno introdotto la possibilità di emettere e memorizzare i corrispettivi senza un registratore telematico, usando una procedura web messa a disposizione dall'Agenzia delle Entrate. La trasmissione avviene direttamente al portale e ha lo stesso valore fiscale dello scontrino tradizionale.",
      },
      {
        heading: "Cosa serve",
        body: "Serve una partita IVA attiva, credenziali Fisconline o SPID per accedere al portale AdE, una connessione internet stabile e un dispositivo (smartphone, tablet o PC). Non occorre hardware certificato, non occorre installazione da tecnico abilitato, non occorre alcun collaudo periodico.",
      },
      {
        heading: "Procedura passo-passo dal portale AdE",
        body: 'Accedi a Fatture e Corrispettivi con SPID o credenziali Fisconline. Nella sezione "Corrispettivi" scegli "Documento commerciale online". Inserisci gli articoli, le quantità e le aliquote IVA. Conferma il pagamento. Il documento viene generato, trasmesso e ti puoi stampare o inviare via email/QR al cliente. Tempo medio per emissione: 30-60 secondi.',
      },
      {
        heading: "Procedura con un'app dedicata",
        body: 'App come ScontrinoZero automatizzano la procedura: salvi il catalogo prodotti una volta, e in fase di emissione basta toccare gli articoli, scegliere il pagamento e premere "Emetti". L\'app si occupa di autenticarsi su AdE con le tue credenziali, di trasmettere il documento e di archiviarlo. Tempo medio: 5-10 secondi per scontrino.',
        image: {
          src: "/screenshots/cassa-tastierino.png",
          alt: "Schermata Cassa di ScontrinoZero: tastierino per l'importo, quantità e aliquota IVA della riga",
          width: 900,
          height: 1944,
          caption:
            "In cassa aggiungi le righe dal tastierino o dal catalogo, poi scegli pagamento ed emetti.",
        },
      },
      {
        heading: "Quale app scegliere per lo scontrino elettronico",
        body: "La risposta secca: un'app che trasmetta il documento commerciale direttamente all'Agenzia delle Entrate con le tue credenziali, senza hardware aggiuntivo, con prezzo trasparente e prova gratuita. I criteri che contano nella scelta sono cinque: velocità di emissione (al banco contano i secondi, non i minuti), costo chiaro senza vincoli di durata né hardware da comprare, storico consultabile con i totali giornalieri, annullo dello scontrino direttamente dall'app, e assistenza raggiungibile quando qualcosa non va. ScontrinoZero è costruita esattamente su questi criteri: catalogo prodotti, emissione in pochi secondi, annullo e storico inclusi, da €29,99 l'anno con 30 giorni di prova senza carta. Per una checklist completa dei criteri vedi la guida alla scelta del software, linkata in fondo.",
      },
      {
        heading: "Quanto costa emettere scontrini senza registratore di cassa",
        body: "Da zero a poche decine di euro l'anno. Il portale Fatture e Corrispettivi dell'Agenzia delle Entrate è gratuito ma lento (30-60 secondi a scontrino); le app dedicate costano in genere 30-100 € l'anno e riducono l'emissione a pochi secondi. Il confronto con il registratore telematico fisico è netto: un RT costa 400-800 € di acquisto più 100-200 € l'anno di manutenzione e il collaudo biennale. La regola pratica: sotto le poche centinaia di scontrini al giorno, o se lavori in mobilità, lo scontrino senza cassa conviene quasi sempre; il registratore fisico resta più rapido solo al banco con code e alti volumi.",
        table: {
          headers: [
            "Soluzione",
            "Costo iniziale",
            "Costo annuo",
            "Tempo per scontrino",
          ],
          rows: [
            ["Portale AdE (gratuito)", "€0", "€0", "30-60 secondi"],
            [
              "App dedicata (es. ScontrinoZero)",
              "€0",
              "30-100 € (ScontrinoZero da €29,99)",
              "pochi secondi",
            ],
            [
              "Registratore telematico",
              "€400-800 + installazione",
              "100-200 € + collaudo biennale",
              "istantaneo al banco",
            ],
          ],
        },
      },
      {
        heading: "Quali attività possono emettere scontrino senza cassa",
        body: "Può farlo qualunque titolare di partita IVA tenuto a certificare i corrispettivi al pubblico: negozi al dettaglio, ambulanti e mercati, artigiani e installatori, parrucchieri ed estetisti, professionisti che incassano al momento, B&B e attività stagionali, contribuenti in regime forfettario. Anche un negozio fisso può rinunciare al registratore telematico e usare solo il documento commerciale online: la legge non impone l'hardware, impone la memorizzazione e trasmissione dei corrispettivi, che il software garantisce allo stesso modo.",
      },
      {
        heading: "Limiti da conoscere",
        body: "Servono connessione internet (offline non si trasmette: in mancanza, si usa la procedura di emergenza prevista dall'AdE), una piccola curva di apprendimento iniziale, e – per le attività ad alto volume – la procedura web pura senza app è più lenta del registratore fisico. Per chi emette pochi scontrini al giorno il vantaggio economico è netto.",
      },
    ],
    faq: [
      {
        question:
          "Posso davvero gestire tutta l'attività senza alcun registratore di cassa?",
        answer:
          "Sì, se rientri nei requisiti normativi (corrispettivi al pubblico, attività compatibile). Migliaia di partite IVA in Italia operano già così. La condizione è avere connessione internet al momento dell'emissione.",
      },
      {
        question: "Cosa succede se internet non funziona?",
        answer:
          "L'Agenzia delle Entrate prevede una procedura di emergenza: emetti uno scontrino manuale (anche su carta) annotando i corrispettivi, e i dati vanno comunque trasmessi al portale entro 12 giorni dall'effettuazione dell'operazione, una volta ripristinata la connessione. ScontrinoZero rileva l'assenza di connessione e suggerisce la procedura.",
      },
      {
        question: "Devo informare l'Agenzia delle Entrate della mia scelta?",
        answer:
          'No. Non serve nessuna comunicazione preventiva: il DCO è una procedura disponibile a tutti i titolari di partita IVA. Se hai un registratore telematico attivo e decidi di non usarlo più, puoi metterlo in stato "fuori servizio" dal portale.',
      },
      {
        question:
          "Qual è la migliore app per fare scontrini senza registratore di cassa?",
        answer:
          "Quella che trasmette direttamente all'AdE con le tue credenziali, ha un prezzo trasparente e ti fa emettere in pochi secondi. Valuta velocità, costo annuo, storico e annullo inclusi, e la possibilità di provare gratis. ScontrinoZero copre tutti questi punti e si prova 30 giorni senza carta di credito.",
      },
      {
        question: "Quanto costa fare scontrini senza registratore di cassa?",
        answer:
          "Da zero: il portale Fatture e Corrispettivi dell'AdE è gratuito, ma richiede 30-60 secondi a scontrino. Un'app dedicata costa in genere 30-100 € l'anno (ScontrinoZero parte da €29,99) ed emette in pochi secondi. Un registratore telematico fisico costa invece 400-800 € di acquisto più 100-200 € l'anno.",
      },
    ],
    relatedHelp: ["primo-scontrino", "credenziali-fisconline", "errori-ade"],
    relatedGuides: [
      "documento-commerciale-online",
      "scegliere-software-scontrini-elettronici",
      "scontrino-regime-forfettario",
    ],
  },

  "differenza-scontrino-ricevuta-fattura": {
    slug: "differenza-scontrino-ricevuta-fattura",
    title: "Differenza fra scontrino, ricevuta fiscale e fattura",
    metaTitle: "Scontrino, ricevuta fiscale o fattura: quale emettere?",
    metaDescription:
      "Le differenze pratiche fra scontrino elettronico, ricevuta fiscale e fattura: quando si usa cosa, esempi tipici per commercianti, artigiani e professionisti.",
    heroIntro:
      "Scontrino, ricevuta fiscale e fattura sono tre documenti diversi con regole diverse. Saper distinguere quando emettere l'uno o l'altro è la base per non sbagliare adempimenti. Vediamo le differenze pratiche con esempi concreti per chi lavora al pubblico.",
    publishedAt: "2026-05-14",
    updatedAt: "2026-05-14",
    readingMinutes: 5,
    sections: [
      {
        heading: "Le tre definizioni in breve",
        body: "Lo scontrino (documento commerciale) certifica il pagamento di una vendita o prestazione al consumatore finale. La ricevuta fiscale è la vecchia versione cartacea dello scontrino, ormai obsoleta e sostituita dal DCO. La fattura è il documento richiesto quando il cliente è una partita IVA o lo chiede esplicitamente, ed è obbligatoria nei rapporti B2B.",
      },
      {
        heading: "Quando emettere lo scontrino",
        body: "Lo emetti per le vendite al consumatore finale che paga e va via senza chiedere altro: barista che serve un caffè, parrucchiere che taglia i capelli, ambulante che vende prodotti al mercato, B&B che ospita un turista. Il documento commerciale online è in questi casi sempre la scelta corretta.",
      },
      {
        heading: "Quando emettere la fattura",
        body: "La fattura è obbligatoria quando il cliente è una partita IVA che la richiede per detrarre l'IVA (B2B), oppure quando il consumatore finale la richiede esplicitamente (es. per spese mediche, ristrutturazioni, lavori in casa con detrazione). In questi casi NON serve emettere anche scontrino: la fattura sostituisce il documento commerciale.",
      },
      {
        heading: "Casi misti tipici",
        body: 'Ristorante che serve un cliente privato: scontrino. Ristorante che fa un catering aziendale: fattura. Idraulico che fa una riparazione a casa di un privato: scontrino, salvo che il cliente chieda fattura per detrazione. Idraulico che lavora per un\'impresa: fattura. Negozio che vende elettronica a un consumatore: scontrino, salvo richiesta esplicita di fattura "parlante" per la garanzia.',
      },
      {
        heading: "E la ricevuta fiscale?",
        body: "La ricevuta fiscale cartacea (la classica con il bollettario) è ormai un fossile: per i corrispettivi al pubblico va emesso il DCO. Resta in uso solo per alcuni casi specifici (prestazioni di servizi occasionali sotto soglia, ricevute non fiscali per attività non soggette IVA), ma per qualsiasi attività commerciale o professionale il documento corretto è scontrino o fattura.",
      },
      {
        heading: "Riepilogo pratico",
        body: "Vendita al privato? Scontrino. Vendita a partita IVA? Fattura. Privato che chiede fattura? Fattura. Caso dubbio? Verifica con il commercialista: una scelta sbagliata può creare problemi in fase di controllo. ScontrinoZero gestisce solo gli scontrini; per le fatture serve un gestionale dedicato (es. Fatture in Cloud).",
      },
    ],
    faq: [
      {
        question: "Posso emettere scontrino E fattura per la stessa vendita?",
        answer:
          'No. Se emetti fattura per una vendita, NON devi emettere anche scontrino: sarebbe una duplicazione del corrispettivo. La fattura ha già il valore fiscale completo. Su ScontrinoZero, se emetti scontrino e poi il cliente chiede fattura, lo scontrino va annullato prima di emettere la fattura "parlante".',
      },
      {
        question: 'Il cliente mi chiede uno scontrino "parlante": che faccio?',
        answer:
          'Lo "scontrino parlante" è uno scontrino con il codice fiscale del cliente, valido per detrazioni fiscali (es. spese mediche, farmaci). Su ScontrinoZero puoi aggiungere il codice fiscale del cliente in fase di emissione: il documento sarà valido per la detrazione.',
      },
      {
        question: "Sono in regime forfettario: emetto scontrino o fattura?",
        answer:
          "Dipende dall'attività: se vendi a consumatori finali (B2C), emetti scontrino (DCO). Se lavori per altre partite IVA (B2B), emetti fattura elettronica. Molti forfettari operano in entrambi i regimi: ScontrinoZero per gli scontrini al pubblico, un gestionale fatture per le fatture B2B.",
      },
    ],
    relatedHelp: [
      "fatture-e-ricevute",
      "primo-scontrino",
      "regime-forfettario",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-regime-forfettario",
    ],
  },

  "pos-rt-obbligo-2026": {
    slug: "pos-rt-obbligo-2026",
    title: "Collegamento POS-RT: obbligo, scadenze e sanzioni 2026",
    metaTitle: "Collegamento POS-RT 2026: obbligo, scadenze e sanzioni",
    metaDescription:
      "Dal 1° gennaio 2026 il POS va collegato al registratore telematico per trasmettere i pagamenti elettronici. Scadenze, sanzioni e cosa cambia per chi usa software.",
    heroIntro:
      "Dal 1° gennaio 2026 è entrato in vigore l'obbligo di collegamento fra POS (terminale di pagamento) e registratore telematico, per trasmettere all'Agenzia delle Entrate gli incassi elettronici insieme ai corrispettivi. La norma ha generato molta confusione: cosa cambia davvero e cosa fare se non usi un RT fisico?",
    publishedAt: "2026-05-14",
    updatedAt: "2026-05-14",
    readingMinutes: 7,
    sections: [
      {
        heading: "Cos'è il collegamento POS-RT",
        body: "L'obbligo previsto dalla Legge di Bilancio 2023 (art. 1 c. 74 L. 197/2022) richiede che il POS sia tecnicamente collegato al registratore telematico, in modo che ogni pagamento elettronico transiti dal POS al RT e venga incluso nei dati trasmessi all'AdE come parte integrante del corrispettivo giornaliero. Lo scopo è la tracciabilità: lo Stato vuole vedere insieme l'incasso elettronico e lo scontrino.",
      },
      {
        heading: "Scadenze e proroghe",
        body: "L'obbligo era inizialmente previsto per il 1° luglio 2023, poi rinviato più volte. Dal 1° gennaio 2026 è operativo per tutti gli esercenti soggetti all'obbligo di memorizzazione e trasmissione dei corrispettivi. Le sanzioni effettive sono entrate in vigore con un periodo di tolleranza iniziale (provvedimenti AdE successivi). Verifica sempre la versione più aggiornata su agenziaentrate.gov.it.",
      },
      {
        heading: "Sanzioni previste",
        body: "Per la mancata trasmissione del singolo pagamento elettronico, la sanzione amministrativa è pari al 90% dell'IVA non documentata correttamente, con un minimo previsto. Esistono inoltre sanzioni accessorie in caso di violazioni reiterate (sospensione della licenza). I controlli sono incrociati: AdE confronta dati POS dalle banche con corrispettivi trasmessi.",
      },
      {
        heading: "Deroghe e casistiche particolari",
        body: "Sono escluse dall'obbligo le attività non soggette a memorizzazione telematica dei corrispettivi (alcune attività di vendita per corrispondenza, vendite online B2C già coperte da altri obblighi, somministrazione su mezzi mobili in alcune casistiche). Verifica sempre con il tuo commercialista in base al codice ATECO.",
      },
      {
        heading: "Cosa cambia se NON ho un registratore telematico",
        body: "Se emetti corrispettivi tramite documento commerciale online (DCO) e non hai un RT fisico, l'obbligo POS-RT non si applica nei termini classici. Il pagamento elettronico viene infatti tracciato direttamente nello scontrino digitale emesso dal software, che già contiene l'informazione del metodo di pagamento (carta, contanti, mista). La normativa più recente ha chiarito questo punto, ma la situazione è in evoluzione.",
      },
      {
        heading: "Come ScontrinoZero gestisce i pagamenti elettronici",
        body: "In fase di emissione dello scontrino, ScontrinoZero permette di specificare il metodo di pagamento (contanti, elettronico, misto). Questa informazione viene inclusa nel DCO trasmesso all'AdE, soddisfacendo l'obbligo di tracciabilità del pagamento elettronico. Non serve hardware aggiuntivo né integrazione fisica con il POS.",
      },
    ],
    faq: [
      {
        question:
          "Se uso solo ScontrinoZero, sono in regola con l'obbligo POS-RT?",
        answer:
          "Sì, nella misura in cui ScontrinoZero registra il metodo di pagamento (contanti/elettronico) per ogni scontrino e lo trasmette all'AdE come parte del documento commerciale. Non hai un POS \"da collegare\" perché non hai un RT fisico: l'obbligo di tracciabilità è soddisfatto dal documento elettronico stesso.",
      },
      {
        question:
          "Devo comprare un POS specifico compatibile con il mio registratore?",
        answer:
          "Se hai un registratore telematico fisico, sì: il POS deve essere certificato come compatibile con quel modello di RT. Se invece usi solo software (DCO via ScontrinoZero), qualunque POS bancario standard va bene: registri il metodo di pagamento nello scontrino e basta.",
      },
      {
        question:
          "Le sanzioni si applicano subito o c'è un periodo di tolleranza?",
        answer:
          "I provvedimenti AdE hanno previsto un periodo di tolleranza iniziale per consentire l'adeguamento di chi aveva RT fisici. Lo stato attuale dei controlli varia: il consiglio è di verificare con il commercialista il proprio profilo di rischio e di essere sempre conformi nella sostanza (tracciabilità del pagamento).",
      },
    ],
    relatedHelp: ["pos-rt-obbligo", "normativa-pos-2026", "primo-scontrino"],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-senza-registratore-di-cassa",
    ],
  },

  "scontrino-regime-forfettario": {
    slug: "scontrino-regime-forfettario",
    title: "Scontrino in regime forfettario: cosa devi sapere",
    metaTitle: "Scontrino elettronico regime forfettario 2026: come emetterlo",
    metaDescription:
      "Anche i forfettari devono emettere scontrino ai privati: come farlo senza registratore di cassa, natura IVA N2, dicitura di esenzione e lotteria. Guida 2026.",
    heroIntro:
      "Il regime forfettario semplifica molti adempimenti (IVA, ritenute, gestione contabile), ma NON esonera dall'obbligo di emettere scontrino al consumatore finale per le vendite B2C. Vediamo come gestire correttamente l'emissione, l'IVA \"a zero\" e gli aspetti operativi tipici del forfettario.",
    publishedAt: "2026-05-14",
    updatedAt: "2026-05-14",
    readingMinutes: 6,
    sections: [
      {
        heading: "Regime forfettario in 2 minuti",
        body: "Il regime forfettario (L. 190/2014 art. 1 c. 54-89) è un regime fiscale agevolato per partite IVA con ricavi fino a 85.000 euro annui. Prevede: aliquota unica al 15% (5% per i primi 5 anni di attività in alcuni casi), non addebita IVA in fattura/scontrino, niente ritenuta d'acconto, contabilità semplificata. È molto usato da professionisti, artigiani e piccoli commercianti.",
      },
      {
        heading: "Devo emettere scontrino anche da forfettario?",
        body: "Sì, sempre, per ogni vendita o prestazione al consumatore finale (B2C). Il forfettario riguarda IL TUO regime fiscale di tassazione del reddito; l'obbligo di emettere il documento commerciale dipende dalla NATURA del cliente e dell'operazione. Se vendi a un consumatore privato che paga subito, devi emettere DCO (o scontrino RT), forfettario o meno.",
      },
      {
        heading: "Come configurare l'IVA",
        body: "Sui documenti emessi da un forfettario l'operazione è non soggetta a IVA ai sensi dell'art. 1 c. 54-89 L. 190/2014. Sullo scontrino (documento commerciale) si indica la natura N2 al posto dell'aliquota; il codice granulare N2.2 riguarda invece la fattura elettronica. In ScontrinoZero non esiste un selettore «regime forfettario» dedicato: durante l'onboarding imposti l'aliquota IVA prevalente su «0% – Non soggette» (natura N2) e, se usi il catalogo rapido, fai lo stesso sui singoli prodotti. La dicitura di esenzione non è richiesta sullo scontrino (basta la natura N2): resta obbligatoria solo sulle fatture.",
      },
      {
        heading: "Lotteria degli Scontrini e altri aspetti",
        body: 'I clienti possono comunque richiedere il codice lotteria sul DCO emesso da un forfettario: il sistema funziona indipendentemente dal regime fiscale dell\'esercente. Allo stesso modo, il cliente può chiedere lo scontrino "parlante" (con codice fiscale) se serve per detrazioni: il forfettario lo emette normalmente.',
      },
      {
        heading: "Esoneri e casi particolari",
        body: "L'obbligo di emissione del DCO non si applica a chi non esercita attività commerciale al pubblico (es. consulenti puri B2B che fatturano solo a partite IVA), o ad attività specificamente esonerate dalla normativa sui corrispettivi (alcune categorie minori). Se sei un consulente forfettario che lavora solo B2B, emetti fattura elettronica e non scontrino.",
      },
      {
        heading: "Esempi pratici tipici",
        body: 'Parrucchiera forfettaria che fa un taglio a una cliente privata: DCO con IVA 0%. Web designer forfettario che fattura un sito a un\'azienda: fattura elettronica via SDI, no scontrino. Ambulante forfettario al mercato che vende a privati: DCO con IVA 0% per ogni vendita. B&B forfettario che ospita un turista: DCO con IVA 0% (eventualmente "parlante" se il turista chiede ricevuta per rimborso aziendale).',
      },
    ],
    faq: [
      {
        question: "Posso usare ScontrinoZero se sono in regime forfettario?",
        answer:
          "Sì, ScontrinoZero è progettato anche per i forfettari. Non c'è un selettore di regime dedicato: durante la configurazione iniziale imposti l'aliquota IVA prevalente su «0% – Non soggette» (natura N2) e, se usi il catalogo, sui singoli prodotti; da lì gli scontrini escono senza IVA, con la natura N2.",
      },
      {
        question:
          "Se supero gli 85.000 euro di ricavi devo cambiare scontrini?",
        answer:
          "Cambia il regime fiscale (si esce dal forfettario), non la modalità di emissione. Continui a emettere DCO via ScontrinoZero ma con le aliquote IVA standard (22%, 10%, 4%, 5%) anziché 0%. La transizione si configura nelle impostazioni dell'app.",
      },
      {
        question:
          "Come gestisco i contanti vs i pagamenti elettronici da forfettario?",
        answer:
          "Allo stesso modo di qualunque altro esercente: in fase di emissione indichi il metodo di pagamento (contanti, carta, misto). L'informazione finisce nel DCO trasmesso all'AdE. Non c'è una gestione speciale per il forfettario su questo punto.",
      },
    ],
    relatedHelp: ["regime-forfettario", "aliquote-iva", "primo-scontrino"],
    relatedGuides: [
      "documento-commerciale-online",
      "differenza-scontrino-ricevuta-fattura",
      "codici-natura-iva",
    ],
    relatedTools: ["dicitura-regime-forfettario"],
  },

  "migrare-da-registratore-telematico-a-software": {
    slug: "migrare-da-registratore-telematico-a-software",
    title: "Migrare dal registratore telematico al software: guida pratica",
    metaTitle: "Migrare da registratore telematico a software: guida",
    metaDescription:
      "Come dismettere il registratore telematico e passare al documento commerciale online via software: verifiche, procedura, aspetti fiscali e errori da evitare.",
    heroIntro:
      "Hai un registratore telematico ma vorresti dismetterlo per passare al documento commerciale online via software? Il passaggio è legittimo e in molti casi conviene, ma richiede alcune verifiche preliminari e attenzione agli adempimenti formali. Vediamo cosa serve, passo per passo.",
    publishedAt: "2026-05-15",
    updatedAt: "2026-05-15",
    readingMinutes: 7,
    sections: [
      {
        heading: "Perché valutare la migrazione",
        body: "Un registratore telematico medio costa €400-800 di acquisto, €100-200 di canone annuo di manutenzione, una visita di collaudo biennale obbligatoria a pagamento e l'installazione iniziale da tecnico abilitato. Il documento commerciale online via software elimina hardware, canoni e collaudi. Per attività con volumi medi o bassi, oppure mobili (ambulanti, B&B, servizi a domicilio), il risparmio annuo è significativo e l'operatività diventa più flessibile.",
      },
      {
        heading: "Quando NON conviene migrare",
        body: "Se gestisci alti volumi alla cassa (>200 scontrini al giorno, picchi con coda), un RT fisico resta più rapido perché non dipende dalla risposta del portale AdE. Se la connessione internet del punto vendita è instabile, considera la procedura mista (RT in negozio + software per consegne a domicilio o eventi esterni). Se hai più operatori che battono contemporaneamente, verifica che il software scelto supporti utenze multiple e ruoli.",
      },
      {
        heading: "Verifiche preliminari",
        body: "Controlla: codice ATECO compatibile con il documento commerciale online (il codice ATECO è quello che identifica il tipo di attività nella tua partita IVA — la quasi totalità delle attività al pubblico è compatibile), regime fiscale (forfettario o ordinario, entrambi gestibili), connessione internet stabile al punto vendita, dispositivo aggiornato (smartphone, tablet, PC). Stima il volume di scontrini medio giornaliero e di picco. Verifica con il commercialista che non ci siano impegni residui di garanzia o assistenza con il fornitore del RT.",
      },
      {
        heading: "Procedura di dismissione del registratore telematico",
        body: 'Accedi a Fatture e Corrispettivi nel portale AdE, sezione "Corrispettivi" → "Gestore ed esercente" → "Ricerca dispositivo". Seleziona il tuo RT e imposta lo stato a "Fuori servizio" o "Dismesso" indicando la data. Non è richiesta alcuna comunicazione preventiva all\'AdE oltre questa dichiarazione: il portale registra la dismissione e da quel momento il dispositivo non è più tenuto a trasmettere.',
      },
      {
        heading: "Attivazione del software e periodo di transizione",
        body: 'Installa il software scelto (es. ScontrinoZero), inserisci P.IVA e dati attività, collega le credenziali AdE (Fisconline o CIE). Fai 1-2 scontrini di test in giornate a basso volume per familiarizzare con il flusso. Puoi tenere il RT in stato "in servizio" per 7-14 giorni in parallelo come fallback. Quando ti senti pronto, dichiara il RT fuori servizio e passa al 100% software. Nessun adempimento aggiuntivo è richiesto durante la sovrapposizione.',
      },
      {
        heading: "Errori comuni da evitare",
        body: "Non lasciare il RT in stato \"attivo\" indefinitamente dopo aver smesso di usarlo: l'AdE si aspetta una trasmissione regolare, e l'assenza può generare segnalazioni di anomalia. Non sottovalutare la curva di apprendimento: dedica 1-2 giornate di formazione ai collaboratori. Verifica sempre la conservazione digitale dei DCO: il software deve archiviarli e renderli scaricabili almeno 10 anni (obbligo fiscale).",
      },
    ],
    faq: [
      {
        question: "Devo comunicare la migrazione all'Agenzia delle Entrate?",
        answer:
          'Non serve una comunicazione formale specifica. È sufficiente impostare lo stato del registratore telematico a "fuori servizio" o "dismesso" dal portale Fatture e Corrispettivi. Da quel momento l\'AdE non si aspetta più trasmissioni da quel dispositivo, e i DCO emessi dal software sono pienamente sostitutivi.',
      },
      {
        question:
          "Posso emettere DCO da software se ho già un registratore telematico attivo?",
        answer:
          "Sì, durante un periodo di transizione i due strumenti possono convivere: bastano alcune accortezze per evitare di emettere lo stesso corrispettivo due volte. Decidi in anticipo quale strumento usare per quale tipologia di vendita (es. negozio = RT, consegne = software), poi quando ti senti pronto dismetti il RT.",
      },
      {
        question:
          "Cosa succede ai dati storici degli scontrini del registratore telematico?",
        answer:
          "Restano nel cassetto fiscale dell'AdE e sono sempre consultabili per i 10 anni di obbligo di conservazione. La migrazione al software non li cancella né li sposta: continueranno a essere disponibili insieme ai nuovi DCO emessi dal software.",
      },
    ],
    relatedHelp: [
      "prima-configurazione",
      "come-collegare-ade",
      "pos-rt-obbligo",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-senza-registratore-di-cassa",
      "pos-rt-obbligo-2026",
    ],
  },

  "chiusura-giornaliera-corrispettivi": {
    slug: "chiusura-giornaliera-corrispettivi",
    title: "Chiusura giornaliera dei corrispettivi: come funziona oggi",
    metaTitle: "Chiusura giornaliera corrispettivi: guida operativa",
    metaDescription:
      "Cos'è la chiusura giornaliera dei corrispettivi, come è cambiata con il documento commerciale online e cosa fare a fine giornata se usi un software.",
    heroIntro:
      'La "chiusura giornaliera" era l\'operazione classica di fine giornata con il registratore di cassa: si stampava lo scontrino di chiusura (la storica "Z") e si trasmettevano i corrispettivi. Con il documento commerciale online la logica è diversa, e in molti casi più semplice. Vediamo cosa devi davvero fare a fine giornata.',
    publishedAt: "2026-05-15",
    updatedAt: "2026-05-15",
    readingMinutes: 5,
    sections: [
      {
        heading: "Cosa significa chiusura giornaliera",
        body: "La chiusura giornaliera è il momento in cui l'esercente totalizza gli incassi del giorno e li trasmette all'Agenzia delle Entrate. Con il registratore telematico fisico è un'operazione esplicita: l'operatore preme un tasto e il dispositivo stampa la chiusura, calcola i totali e li invia. È un retaggio della normativa precedente all'obbligo di memorizzazione in tempo reale.",
      },
      {
        heading: "Cosa cambia con il documento commerciale online",
        body: "Con il DCO emesso da software, la trasmissione all'AdE avviene istantaneamente al momento dell'emissione di ogni singolo scontrino. Non esiste più un \"momento di chiusura\" separato perché ogni corrispettivo è già nel sistema dell'Agenzia. L'operazione di fine giornata si riduce a una verifica gestionale (totali, cassa, conciliazione POS), non a un adempimento fiscale obbligatorio.",
      },
      {
        heading: "Cosa fare comunque a fine giornata",
        body: "Anche se non è obbligatorio fiscalmente, una buona pratica gestionale è: conciliare la cassa fisica (contanti incassati vs registrato), conciliare il POS (transazioni elettroniche vs scontrini con metodo elettronico), esportare l'elenco scontrini del giorno per archiviazione interna, verificare che non ci siano scontrini in stato PENDING o ERROR da gestire.",
      },
      {
        heading: "Verificare i corrispettivi sul portale AdE",
        body: 'Periodicamente (settimanale o mensile) controlla il riepilogo nel portale "Fatture e Corrispettivi" → "Corrispettivi" → "Monitoraggio". Vedrai l\'elenco di tutti i DCO trasmessi con stato di accettazione. È utile per identificare eventuali scarti dell\'AdE e per fornire al commercialista i totali del periodo. Il software dovrebbe avere uno storico locale equivalente, ma il portale è la fonte autoritativa.',
      },
      {
        heading: "Errori frequenti e segnali da monitorare",
        body: "Scontrino in stato PENDING per più di 5 minuti: il software ha provato a trasmettere ma non ha ricevuto la conferma AdE. Scontrino REJECTED: la trasmissione è stata rifiutata, leggi il codice errore e correggi (di solito dati P.IVA o aliquote non valide). Differenza fra totale scontrini e totale cassa: verifica resi non registrati, scontrini annullati o doppi. Il software dovrebbe segnalare questi casi.",
      },
    ],
    faq: [
      {
        question:
          "Devo fare la chiusura giornaliera anche se uso solo il software?",
        answer:
          "No, non è un adempimento fiscale obbligatorio: ogni scontrino è già trasmesso individualmente in tempo reale. Resta consigliata come operazione gestionale interna (riconciliazione cassa, controllo POS, archiviazione) ma non sostituisce nessun obbligo di legge.",
      },
      {
        question: "Cosa devo dare al commercialista per la dichiarazione IVA?",
        answer:
          "Il commercialista può scaricare direttamente dal portale Fatture e Corrispettivi il riepilogo dei corrispettivi trasmessi per il periodo richiesto. In alternativa, esporta dal software l'elenco scontrini in CSV/Excel con totali per aliquota IVA e metodo di pagamento. ScontrinoZero esporta i dati in formato standard.",
      },
      {
        question:
          "Se il software non trasmette uno scontrino, come faccio la chiusura?",
        answer:
          "Identifica gli scontrini in stato PENDING o ERROR dallo storico. Per quelli in PENDING, il sistema fa retry automatico. Per quelli in ERROR, leggi il codice di errore AdE e correggi. Se l'errore persiste e non hai connessione, applicare la procedura di emergenza: emissione manuale + trasmissione entro 12 giorni dalla cessazione del guasto.",
      },
    ],
    relatedHelp: [
      "chiusura-giornaliera",
      "numero-documento-azzeramento",
      "storico-ed-esportazione",
      "cassetto-fiscale",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-senza-registratore-di-cassa",
    ],
  },

  "annullare-scontrino-elettronico": {
    slug: "annullare-scontrino-elettronico",
    title: "Annullare uno scontrino elettronico: procedura e normativa",
    metaTitle: "Annullare scontrino elettronico: come fare e quando",
    metaDescription:
      "Come annullare un documento commerciale elettronico già trasmesso all'AdE: termini, procedura tecnica, differenza fra annullamento e reso, casi pratici.",
    heroIntro:
      'Dopo aver emesso uno scontrino elettronico ti accorgi di un errore, oppure il cliente cambia idea e chiede il rimborso: si può annullare? Sì, ma con regole precise. Lo "scontrino di annullamento" è un documento dedicato che cancella fiscalmente il precedente. Vediamo procedura, termini e casi pratici tipici.',
    publishedAt: "2026-05-15",
    updatedAt: "2026-05-15",
    readingMinutes: 6,
    sections: [
      {
        heading: "Quando si può annullare uno scontrino",
        body: "L'annullamento di un DCO è ammesso entro termini ragionevoli rispetto all'emissione, generalmente nella stessa giornata o entro pochi giorni. La normativa non fissa un termine perentorio universale, ma in pratica l'annullamento è destinato a correggere errori di battitura, ripetizioni accidentali o rinunce immediate del cliente. Per resi a distanza di tempo si usa invece la nota di credito (se c'è fattura) o la gestione \"reso\" interna.",
      },
      {
        heading: "Differenza fra annullamento e reso",
        body: 'Annullamento: cancella fiscalmente lo scontrino come se non fosse mai esistito, lascia traccia normativa nel sistema AdE. Si usa quando lo scontrino è errato o non doveva essere emesso (es. cliente paga in contanti ma battuto come "elettronico"). Reso: lo scontrino originale resta valido, e si emette un nuovo DCO di importo negativo che documenta la restituzione (es. cliente torna dopo 3 giorni perché il prodotto è difettoso).',
      },
      {
        heading: "Procedura tecnica con il portale AdE",
        body: 'Dal portale Fatture e Corrispettivi accedi a "Corrispettivi" → "Ricerca documento", trova il DCO da annullare e seleziona l\'operazione di annullamento. Il portale genera un documento di tipo "VOID" (annullamento) collegato all\'originale, lo trasmette e aggiorna lo stato del documento di partenza a "annullato". Il documento di annullamento ha un proprio progressivo e va conservato come tutti gli altri.',
      },
      {
        heading: "Procedura con software dedicato",
        body: "Un software come ScontrinoZero ti permette di annullare uno scontrino direttamente dallo storico: apri la riga del documento e selezioni \"Annulla\". L'app emette per te il DCO di annullamento con i riferimenti corretti, lo trasmette ad AdE e aggiorna lo stato. È un'operazione irreversibile: una volta annullato, lo scontrino non si recupera. Per sicurezza il sistema chiede conferma esplicita.",
        image: {
          src: "/screenshots/storico-dettaglio.png",
          alt: "Dettaglio di uno scontrino nello Storico di ScontrinoZero, con l'azione per annullare il documento",
          width: 900,
          height: 1860,
          caption:
            "Dal dettaglio dello scontrino nello Storico avvii l'annullamento, con conferma esplicita.",
        },
      },
      {
        heading: "Conservazione e tracciabilità",
        body: "Lo scontrino originale annullato NON sparisce dallo storico: resta consultabile, marcato come annullato, con riferimento al documento di annullamento. Questa tracciabilità è obbligatoria per legge: in caso di controllo, l'AdE deve poter ricostruire la catena (emissione → annullamento) e verificare che non ci siano stati incassi fittizi successivamente annullati per evadere.",
      },
      {
        heading: "Casi pratici",
        body: "Errore di battitura su un prezzo (es. €15 invece di €1,50): annulla e ribatti. Cliente cambia idea prima di uscire dal negozio: annulla e restituisci il contante o storna la carta. Doppia battitura accidentale dello stesso scontrino: annulla quello in eccesso. Reso a distanza di tempo (giorni): NON annullare, emetti un DCO di importo negativo (gestione reso). Vendita errata con fattura B2B: NON annullare il DCO, emetti una nota di credito sulla fattura.",
      },
    ],
    faq: [
      {
        question: "Posso annullare uno scontrino emesso ieri?",
        answer:
          "Tecnicamente sì, l'AdE accetta l'annullamento entro termini ragionevoli. In pratica, se è passato più di un giorno e il cliente è tornato per restituzione, è più corretto trattare il caso come reso (DCO negativo) anziché come annullamento, perché lo scontrino originale ha già documentato un'operazione reale.",
      },
      {
        question: "Cosa succede se annullo uno scontrino con codice lotteria?",
        answer:
          "L'annullamento invalida anche la partecipazione del cliente alla Lotteria degli Scontrini: il codice lotteria collegato a quel DCO viene rimosso dal sistema AdE. Informa il cliente prima di annullare, soprattutto se la transazione è già stata estratta nella lotteria istantanea.",
      },
      {
        question:
          "Quanti annullamenti posso fare? Esiste un limite o vengo monitorato?",
        answer:
          "Non esiste un limite numerico esplicito, ma l'AdE può monitorare pattern anomali (es. tasso annullamento molto sopra la media di settore) come possibile indicatore di evasione. Annulla solo quando necessario e per cause documentabili; per resi a distanza usa sempre la modalità reso (DCO negativo).",
      },
    ],
    relatedHelp: [
      "annullare-scontrino",
      "numero-documento-azzeramento",
      "errori-ade",
      "primo-scontrino",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "differenza-scontrino-ricevuta-fattura",
    ],
  },

  "lotteria-scontrini-commerciante": {
    slug: "lotteria-scontrini-commerciante",
    title: "Lotteria degli Scontrini: cosa deve fare il commerciante",
    metaTitle: "Lotteria scontrini lato commerciante: obblighi e procedura",
    metaDescription:
      "La Lotteria degli Scontrini vista dall'esercente: come acquisire il codice, cosa cambia in caso di rifiuto, stato attuale della lotteria istantanea e periodica.",
    heroIntro:
      "La Lotteria degli Scontrini è un sistema premio per i consumatori che presentano un codice al momento dell'acquisto. Per il commerciante è un'attività operativa semplice: contrariamente a quanto si legge in giro, oggi non esiste una sanzione amministrativa per il rifiuto del codice — la previsione iniziale del decreto fiscale 2020 fu eliminata in sede di conversione. Resta però un meccanismo di segnalazione del cliente sul Portale Lotteria, che alimenta l'analisi del rischio dell'Agenzia delle Entrate.",
    publishedAt: "2026-05-15",
    updatedAt: "2026-05-15",
    readingMinutes: 6,
    sections: [
      {
        heading: "Come funziona la Lotteria degli Scontrini",
        body: "Il consumatore richiede gratuitamente sul sito lotteriadegliscontrini.gov.it un codice personale di 8 caratteri alfanumerici. Quando fa un acquisto, lo presenta all'esercente (cartaceo, smartphone o tessera plastificata): l'esercente lo inserisce nel DCO, il codice viene trasmesso ad AdE insieme allo scontrino, e ad ogni euro di spesa corrispondono uno o più biglietti virtuali per le estrazioni periodiche.",
      },
      {
        heading: "Cosa deve fare il commerciante",
        body: "Quando il cliente esibisce il codice lotteria, va inserito nel DCO e trasmesso ad AdE insieme allo scontrino. Non si tratta di un obbligo sanzionato: la sanzione amministrativa prevista dal decreto fiscale collegato alla Manovra 2020 fu eliminata in sede di conversione e non è mai stata reintrodotta. Resta però buona pratica accettare sempre il codice, sia per servizio al cliente sia per evitare segnalazioni sul Portale Lotteria (che possono alimentare l'analisi del rischio AdE/GdF). Il codice è strettamente personale del cliente: non va memorizzato né riusato.",
      },
      {
        heading: "Come acquisire il codice in fase di emissione",
        body: "Tutti i software che emettono DCO devono prevedere un campo dedicato per il codice lotteria. Su ScontrinoZero, prima di confermare l'emissione, compare un campo opzionale dove inserire il codice (8 caratteri maiuscoli o numeri). Una validazione lato app verifica il formato; il codice corretto viene incluso nel tracciato DCO trasmesso ad AdE. Tempo aggiuntivo per scontrino: 5-10 secondi.",
      },
      {
        heading: "Lotteria periodica e lotteria istantanea: stato attuale",
        body: "Oggi è attiva solo la lotteria periodica: il sistema effettua estrazioni regolari (mensili e annuali) fra tutti gli scontrini trasmessi con un codice lotteria valido. La lotteria istantanea — vincita comunicata pochi secondi dopo l'emissione, riservata ai pagamenti elettronici — è stata annunciata più volte ma a maggio 2026 non risulta ancora avviata (le gare d'appalto per il sistema sono andate deserte). Quando partirà, il commerciante non dovrà cambiare nulla nel flusso di emissione: l'eventuale vincita viene comunicata direttamente al cliente.",
      },
      {
        heading: "Conseguenze del rifiuto",
        body: "Non c'è una sanzione automatica. Il consumatore può però segnalare il rifiuto tramite il portale lotteriadegliscontrini.gov.it: le segnalazioni vengono aggregate da AdE e Guardia di Finanza e usate come indicatore nelle attività di analisi del rischio di evasione (insieme ad altri segnali, come la trasmissione irregolare dei corrispettivi). In altre parole, il rifiuto non comporta una multa immediata, ma alza il profilo di rischio del punto vendita.",
      },
      {
        heading: "Aspetti pratici quotidiani",
        body: "Forma il personale di cassa: quando il cliente mostra un codice o un foglietto da 8 caratteri, va inserito nel sistema. Tieni un cartello informativo in cassa che spiega che il negozio aderisce alla lotteria. Se il software non funziona temporaneamente, registra il codice manualmente e inseriscilo al ripristino. In caso di reso: lo scontrino con codice lotteria può essere annullato, ma comunicalo al cliente per trasparenza.",
      },
    ],
    faq: [
      {
        question:
          "Sono in regime forfettario: devo gestire la lotteria degli scontrini?",
        answer:
          "Sì, anche in regime forfettario puoi (e in pratica conviene) accettare il codice lotteria del cliente: la lotteria si applica al consumatore finale, non al regime fiscale dell'esercente. Il DCO emesso da un forfettario include normalmente il campo lotteria, con la natura N2 (operazione non soggetta IVA art. 1 c. 54-89 L. 190/2014) al posto dell'aliquota.",
      },
      {
        question:
          "Posso chiedere al cliente se ha il codice lotteria, o aspetto che me lo dia?",
        answer:
          'Puoi (e dovresti) chiedere proattivamente: è una pratica di servizio al cliente. Molti consumatori non sanno che possono partecipare, o dimenticano di esibire il codice. Un semplice "ha il codice lotteria?" prima della battuta finale è apprezzato e dimostra che il punto vendita è organizzato.',
      },
      {
        question:
          "Il codice lotteria del cliente identifica una persona fisica? Devo conservarlo?",
        answer:
          "Il codice lotteria è anonimo per il commerciante: non corrisponde al codice fiscale né a dati anagrafici visibili. Non devi conservarlo nei tuoi sistemi oltre la trasmissione AdE: viene incluso nel DCO e poi non serve più localmente. Lo stesso codice può essere usato dal cliente in vari negozi.",
      },
    ],
    relatedHelp: [
      "primo-scontrino",
      "intestazione-scontrino",
      "regime-forfettario",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-regime-forfettario",
    ],
  },

  "scegliere-software-scontrini-elettronici": {
    slug: "scegliere-software-scontrini-elettronici",
    title: "Come scegliere un software per scontrini elettronici",
    metaTitle: "Scegliere software scontrini elettronici: 6 criteri pratici",
    metaDescription:
      "I criteri operativi e tecnici per scegliere il software giusto per emettere scontrini elettronici: funzionalità, costi, sicurezza credenziali, conformità AdE.",
    heroIntro:
      "Il mercato dei software per scontrini elettronici è cresciuto rapidamente: web app, app mobile, gestionali integrati, soluzioni self-hosted. Scegliere quello giusto significa risparmiare ore di lavoro mensili ed evitare incidenti fiscali. Vediamo 6 criteri pratici per orientarti senza farti convincere dal marketing.",
    publishedAt: "2026-05-15",
    updatedAt: "2026-05-15",
    readingMinutes: 7,
    sections: [
      {
        heading: "Criterio 1: tipologia di emissione supportata",
        body: 'Verifica che il software emetta documento commerciale online via portale Fatture e Corrispettivi (DCO), non un "scontrino interno" non trasmesso. La differenza è enorme: il primo è fiscalmente valido, il secondo no. Il software deve gestire l\'autenticazione sul portale AdE con le tue credenziali Fisconline o SPID e replicare il flusso ufficiale. Cerca riferimenti espliciti al Provvedimento AdE del 28 ottobre 2016.',
      },
      {
        heading: "Criterio 2: dove vengono custodite le tue credenziali AdE",
        body: 'Per emettere DCO il software accede al tuo portale Fatture e Corrispettivi con le tue credenziali AdE. Verifica come sono custodite: cifrate at-rest con algoritmi standard (AES-256-GCM), accessibili solo dal tuo server, mai loggate in chiaro. Sospetta dei software che ti chiedono "username e password" via email o moduli web non protetti. Le opzioni self-hosted offrono il massimo controllo: le credenziali restano sul tuo server.',
      },
      {
        heading: "Criterio 3: costi reali (non solo il canone)",
        body: 'Non guardare solo il canone mensile pubblicizzato. Calcola: costo per scontrino oltre soglia (alcuni piani limitano il volume), costo per funzionalità aggiuntive ("plug-in" a pagamento per export CSV, analytics, multi-operatore), costo di onboarding (consulenza obbligatoria?), costo di uscita (esportazione dati propri). Confronta su orizzonte 24 mesi: un canone basso con add-on caro è spesso più costoso di un piano flat completo.',
      },
      {
        heading: "Criterio 4: funzionalità operative essenziali",
        body: "Cataloghi prodotti con prezzo/aliquota memorizzati, gestione metodi di pagamento misti, supporto Lotteria degli Scontrini, gestione annullamento/reso, storico ricercabile, export dati in formato standard (CSV o JSON). Per attività con più operatori: utenze multiple con ruoli. Per attività mobili: funziona offline con sincronizzazione successiva? Per il commercialista: i dati sono scaricabili da te o solo dal provider?",
      },
      {
        heading: "Criterio 5: conformità normativa e supporto fiscale",
        body: 'Verifica che il software sia esplicitamente conforme al D.Lgs. 127/2015, al Provvedimento AdE del 28 ottobre 2016 n. 182017 e alle modifiche successive. Le pagine di prodotto onesti citano i riferimenti normativi; quelle vaghe parlano solo di "compliance fiscale". Verifica che il software gestisca il regime forfettario (IVA 0% e dicitura esenzione), l\'obbligo POS-RT 2026, le aliquote IVA differenziate. Il supporto deve sapere rispondere a domande fiscali, non solo tecniche.',
      },
      {
        heading: "Criterio 6: lock-in e portabilità dei dati",
        body: "Cosa succede se decidi di cambiare software? Puoi esportare integralmente i tuoi DCO emessi? In quale formato? Hai accesso allo storico anche dopo la disdetta? Un buon software permette export completo via interfaccia o API, in formati standard (CSV, JSON, XML). I software che trattengono i dati ostaggio sono da evitare. Le soluzioni self-hosted danno il massimo controllo: i dati sono nel TUO server, non li perdi mai.",
      },
    ],
    faq: [
      {
        question:
          "I software gratuiti per scontrini elettronici sono affidabili?",
        answer:
          'Dipende. Esistono soluzioni open source self-hosted ben fatte (es. la versione self-hosted di ScontrinoZero) e progetti abbandonati o non aggiornati. Verifica: ultimo commit recente, community attiva, documentazione completa, riferimenti normativi citati. Se "gratis" significa "ti monetizziamo con ads o vendita dati", scartalo: i dati fiscali non vanno condivisi con terze parti.',
      },
      {
        question:
          "Posso provare un software prima di pagare un abbonamento annuale?",
        answer:
          "Sì, la quasi totalità dei software propone un trial gratuito (tipicamente 14-30 giorni) senza necessità di carta di credito iniziale. Approfittane per emettere alcuni scontrini di test in giornate a basso volume e verificare il flusso reale. Diffida dei software che chiedono pagamento immediato senza periodo di prova: la promessa marketing va sempre confrontata con l'uso quotidiano.",
      },
      {
        question: "Posso usare lo stesso software sia da smartphone sia da PC?",
        answer:
          "I software moderni sono web-based o PWA (Progressive Web App): si usano da browser o si installano come app sul dispositivo, mantenendo i dati sincronizzati. Verifica che il software supporti tutti i dispositivi che usi (Android, iOS, Windows, macOS) e che l'esperienza mobile sia ottimizzata: emettere scontrini su smartphone deve essere veloce quanto al desktop.",
      },
    ],
    relatedHelp: [
      "piani-e-prezzi",
      "prima-configurazione",
      "sicurezza-credenziali",
    ],
    relatedGuides: [
      "documento-commerciale-online",
      "scontrino-senza-registratore-di-cassa",
      "pos-rt-obbligo-2026",
    ],
  },
  "codici-natura-iva": {
    slug: "codici-natura-iva",
    title: "Codici natura IVA: cosa sono e quando si usano",
    metaTitle: "Natura IVA N2.2: cosa significa e dicitura forfettari",
    metaDescription:
      "Cosa sono i codici natura IVA N1-N7, cosa significa N2.2 per il regime forfettario in fattura elettronica, perché sullo scontrino si usa N2 e quale dicitura indicare.",
    heroIntro:
      "I codici natura IVA (N1, N2, N2.2, N3, N4, N5, N6, N7) servono a spiegare al fisco perché su un'operazione non viene addebitata l'IVA con un'aliquota ordinaria. Sono obbligatori nel tracciato della fattura elettronica e dei corrispettivi telematici. Qui vediamo cosa significano uno per uno, perché il regime forfettario usa N2.2 in fattura ma N2 sullo scontrino, e quale dicitura di esenzione indicare.",
    publishedAt: "2026-06-29",
    updatedAt: "2026-07-12",
    readingMinutes: 8,
    sections: [
      {
        heading: "Cosa sono i codici natura IVA",
        body: "Il codice natura è un'etichetta che, nel tracciato XML della fattura elettronica e nel tracciato dei corrispettivi telematici, indica il motivo per cui un'operazione non è assoggettata all'IVA ordinaria (4%, 5%, 10%, 22%). Senza un'aliquota da esporre, il sistema dell'Agenzia delle Entrate ha comunque bisogno di sapere se l'operazione è esclusa, non soggetta, non imponibile, esente, in regime del margine o in inversione contabile: il codice natura risponde proprio a questa domanda. È un dato obbligatorio: una riga a 0% senza codice natura viene scartata.",
      },
      {
        heading: "La tabella completa dei codici natura IVA (N1-N7)",
        body: "Questi sono tutti i codici natura previsti dalle specifiche tecniche dell'Agenzia delle Entrate. Dal 1° gennaio 2021, in fattura elettronica i codici aggregati N2, N3 e N6 non sono più accettati: vanno usati i sottocodici granulari (N2.1, N2.2, N3.1-N3.6, N6.1-N6.9). Il tracciato dello scontrino elettronico, invece, usa ancora i codici aggregati.",
        table: {
          headers: ["Codice", "Significato", "Quando si usa"],
          rows: [
            [
              "N1",
              "Operazioni escluse ex art. 15 DPR 633/72",
              "Rimborsi di spese anticipate in nome e per conto del cliente, interessi di mora, imballaggi a rendere",
            ],
            [
              "N2",
              "Operazioni non soggette (codice aggregato)",
              "Solo sullo scontrino elettronico: è il codice unico per le non soggette, regime forfettario incluso",
            ],
            [
              "N2.1",
              "Non soggette per carenza di territorialità (artt. 7 - 7-septies DPR 633/72)",
              "Prestazioni rese a soggetti esteri fuori dal campo IVA italiano",
            ],
            [
              "N2.2",
              "Non soggette - altri casi",
              "Regime forfettario, regime di vantaggio (ex minimi), operazioni fuori campo IVA",
            ],
            [
              "N3.1-N3.6",
              "Operazioni non imponibili",
              "Esportazioni, cessioni intracomunitarie, cessioni verso San Marino, operazioni con lettera d'intento",
            ],
            [
              "N4",
              "Operazioni esenti ex art. 10 DPR 633/72",
              "Prestazioni sanitarie, finanziarie, assicurative, formative",
            ],
            [
              "N5",
              "Regime del margine / IVA non esposta",
              "Beni usati, oggetti d'arte e antiquariato, agenzie di viaggio",
            ],
            [
              "N6.1-N6.9",
              "Inversione contabile (reverse charge)",
              "Edilizia e settori connessi, rottami, elettronica, subappalti",
            ],
            [
              "N7",
              "IVA assolta in altro Stato UE",
              "Vendite a distanza intra-UE sopra soglia, servizi elettronici a consumatori UE (regime OSS)",
            ],
          ],
        },
      },
      {
        heading: "N2.2: cosa significa",
        body: 'N2.2 significa "operazione non soggetta a IVA - altri casi": è il codice natura che nel tracciato della fattura elettronica identifica le operazioni fuori dal campo di applicazione dell\'IVA per motivi diversi dalla carenza di territorialità (coperta da N2.1). Il caso di gran lunga più frequente è la fattura emessa da un contribuente in regime forfettario; rientrano in N2.2 anche il regime di vantaggio (ex minimi) e le altre operazioni fuori campo IVA. È obbligatorio dal 1° gennaio 2021, quando le specifiche tecniche della fatturazione elettronica hanno reso inutilizzabile il codice generico N2.',
      },
      {
        heading: "N2 vs N2.2: qual è la differenza",
        body: 'N2 è il codice aggregato ("operazioni non soggette"), N2.2 è uno dei suoi due sottocodici. In fattura elettronica, dal 1° gennaio 2021, il codice N2 generico non è più accettato: si usa N2.1 (carenza di territorialità) oppure N2.2 (altri casi). Il tracciato del documento commerciale online (lo scontrino elettronico), invece, non prevede la suddivisione fine: usa ancora il codice aggregato N2. Quindi lo stesso forfettario indica N2.2 in fattura e N2 sullo scontrino. Non è una contraddizione: sono due tracciati diversi dell\'Agenzia delle Entrate, con livelli di dettaglio diversi sullo stesso concetto.',
      },
      {
        heading: "Codice IVA N2.2: a quale aliquota corrisponde",
        body: "A nessuna aliquota: N2.2 si abbina sempre ad aliquota 0%, perché segnala un'operazione fuori dal campo di applicazione dell'IVA. Non corrisponde a un'aliquota ridotta né a un'esenzione: l'operazione esente (per esempio una prestazione sanitaria) usa il codice N4, mentre N2.2 dice che l'IVA non si applica proprio, come nel regime forfettario. In pratica, nel software di fatturazione si seleziona aliquota 0% e natura N2.2 sulla stessa riga.",
      },
      {
        heading: "N2.2 e regime forfettario: il codice in fattura elettronica",
        body: "Chi è in regime forfettario non addebita l'IVA in fattura (art. 1, comma 58, Legge 190/2014). Nel tracciato della fattura elettronica questa è un'operazione \"non soggetta - altri casi\", quindi si usa il codice natura N2.2. È l'errore più comune: molti cercano un'aliquota \"esente\" (che sarebbe N4) o lasciano la riga senza codice. Per il forfettario la natura corretta in fattura è sempre N2.2, con aliquota 0%.",
      },
      {
        heading:
          "La dicitura di esenzione: cosa scrivere e quale articolo citare",
        body: "Sulla fattura del forfettario, oltre al codice natura, va riportata la dicitura che richiama la norma. La formula tipica è: \"Operazione effettuata ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario. Non soggetta a ritenuta d'acconto ai sensi del comma 67\". Se l'importo della fattura supera 77,47 €, va aggiunta la marca da bollo di 2 € (assolta in modo virtuale per l'elettronica). Sullo scontrino al consumatore finale non serve invece alcuna dicitura particolare: basta che le righe siano emesse con natura N2.",
      },
      {
        heading: "Come ScontrinoZero gestisce la natura N2",
        body: "In ScontrinoZero imposti l'IVA prevalente della tua attività su \"0% - Non soggette\" (natura N2) in onboarding o in Impostazioni → Attività: da quel momento le righe dello scontrino vengono emesse e trasmesse all'AdE con il codice natura N2 corretto per il documento commerciale, senza che tu debba ricordartelo a ogni vendita. Per la fattura elettronica B2B (N2.2) serve invece un software di fatturazione: ScontrinoZero si occupa degli scontrini al consumatore finale.",
      },
    ],
    faq: [
      {
        question: "Cosa significa il codice natura IVA N2.2?",
        answer:
          "N2.2 indica un'operazione \"non soggetta - altri casi\" nel tracciato della fattura elettronica. È il codice usato dal regime forfettario, che per legge non addebita l'IVA. Si abbina sempre ad aliquota 0%.",
      },
      {
        question: "Qual è la dicitura da scrivere per il regime forfettario?",
        answer:
          'Sulla fattura si indica: "Operazione effettuata ai sensi dell\'articolo 1, commi da 54 a 89, della Legge n. 190/2014 - Regime forfettario". Sullo scontrino al consumatore finale non serve alcuna dicitura: basta la natura N2.',
      },
      {
        question:
          "Che articolo di legge devo citare per l'esenzione del forfettario?",
        answer:
          "Il riferimento è l'articolo 1, commi da 54 a 89, della Legge 190/2014 (legge di stabilità 2015), che ha istituito il regime forfettario. Il comma 58 stabilisce che il forfettario non addebita l'IVA in fattura.",
      },
      {
        question: "Sullo scontrino devo usare N2 o N2.2?",
        answer:
          "Sullo scontrino (documento commerciale online) si usa N2: il tracciato dei corrispettivi non prevede il sottocodice N2.2, che esiste solo nella fattura elettronica. Stesso concetto, due tracciati diversi.",
      },
      {
        question: "Il codice natura è obbligatorio anche sullo scontrino?",
        answer:
          "Sì. Ogni riga a 0% deve avere un codice natura, altrimenti la trasmissione all'Agenzia delle Entrate viene scartata. Per le operazioni non soggette del forfettario il codice corretto sullo scontrino è N2.",
      },
      {
        question: "Che differenza c'è tra N2.1 e N2.2?",
        answer:
          "Sono i due sottocodici delle operazioni non soggette. N2.1 copre la carenza del requisito di territorialità (artt. 7 - 7-septies DPR 633/72, tipicamente prestazioni verso l'estero); N2.2 copre tutti gli altri casi, incluso il regime forfettario e il regime di vantaggio.",
      },
    ],
    relatedHelp: ["regime-forfettario", "aliquote-iva", "fatture-e-ricevute"],
    relatedGuides: [
      "scontrino-regime-forfettario",
      "differenza-scontrino-ricevuta-fattura",
    ],
    relatedTools: ["dicitura-regime-forfettario"],
  },

  "stampante-termica-wifi-scontrini": {
    slug: "stampante-termica-wifi-scontrini",
    title: "Stampanti termiche WiFi per scontrini: guida alla scelta",
    metaTitle: "Stampante termica WiFi per scontrini: guida alla scelta 2026",
    metaDescription:
      "Stampante termica WiFi, Bluetooth o USB per gli scontrini? Differenze, fasce di prezzo, larghezza carta 58 o 80 mm e compatibilità ESC/POS: la guida alla scelta.",
    heroIntro:
      "Per stampare gli scontrini non serve una stampante fiscale: basta una stampante termica generica, da 30-120 € a seconda del modello. La WiFi conviene per la postazione fissa condivisa tra più dispositivi, il Bluetooth per la cassa mobile, l'USB per chi lavora da computer. Prima di comprare verifica tre cose: linguaggio ESC/POS, larghezza carta (58 o 80 mm) e il tipo di connessione adatto a come lavori.",
    publishedAt: "2026-07-12",
    updatedAt: "2026-07-12",
    readingMinutes: 7,
    sections: [
      {
        heading: "Serve una stampante fiscale? No",
        body: "Con il documento commerciale online lo scontrino ha già valore fiscale nel momento in cui viene trasmesso all'Agenzia delle Entrate: la stampa su carta è solo una copia di cortesia per il cliente, nemmeno obbligatoria (puoi mostrare lo scontrino a schermo o inviarlo via email). Per questo non serve un registratore telematico omologato (400-800 € di hardware più 100-200 € l'anno di manutenzione), né va dichiarato nulla all'AdE: una qualsiasi stampante termica generica, la stessa usata per le ricevute dei POS bancari, fa il lavoro. È la differenza di costo più grande rispetto alla cassa tradizionale.",
      },
      {
        heading: "WiFi, Bluetooth o USB: il confronto",
        body: "Le stampanti termiche per scontrini si collegano in tre modi, e la connessione è il primo criterio di scelta perché dipende da come lavori: banco fisso con più dispositivi, cassa mobile dal telefono o postazione singola con computer. Molti modelli combinano due o tre connessioni (es. WiFi + USB, Bluetooth + USB): a parità di prezzo, un modello multi-connessione ti lascia libero di cambiare organizzazione in futuro.",
        table: {
          headers: ["Connessione", "Ideale per", "Vantaggi", "Limiti"],
          rows: [
            [
              "WiFi / Ethernet",
              "Banco fisso con più dispositivi o casse",
              "Copre tutto il locale, condivisibile tra più computer senza abbinamenti, niente cavi al banco",
              "Richiede una rete stabile e una configurazione iniziale; prezzo un po' più alto; se cade la rete non stampa",
            ],
            [
              "Bluetooth",
              "Cassa mobile: mercati, food truck, servizio al tavolo",
              "Si abbina direttamente a telefono o tablet, funziona senza router, modelli portatili a batteria",
              "Portata ~10 metri, abbinata a un dispositivo per volta",
            ],
            [
              "USB",
              "Postazione fissa con computer",
              "Collegamento plug-and-play, stabilità massima, prezzi più bassi",
              "Vincolata dal cavo a un solo computer",
            ],
          ],
        },
      },
      {
        heading: "Quando conviene davvero la WiFi",
        body: 'La stampante WiFi (o Ethernet, il cavo di rete: stessa logica) dà il meglio quando è una risorsa condivisa: un punto vendita fisso dove più operatori o più postazioni stampano sulla stessa macchina, oppure quando la stampante sta lontana dal banco e il cavo USB non arriva. Essendo collegata alla rete del locale, qualsiasi computer che la vede installata può stamparci, senza abbinamenti dispositivo per dispositivo. Non conviene invece per l\'attività ambulante o stagionale senza un router a disposizione: lì il Bluetooth, che collega telefono e stampante direttamente senza alcuna rete di mezzo, è la scelta giusta. Attenzione infine alle schede prodotto: alcune stampanti economiche vendute come "wireless" sono in realtà solo Bluetooth — se ti serve la rete, cerca esplicitamente "WiFi" o "LAN/Ethernet" tra le specifiche.',
      },
      {
        heading: "58 o 80 mm: quale larghezza carta",
        body: "Le due larghezze standard dei rotoli termici sono 58 mm e 80 mm. Il 58 mm è il formato delle mini-stampanti portatili e delle postazioni compatte: ingombro minimo, rotoli economici, perfetto in mobilità. L'80 mm è il classico formato da banco dei negozi: scontrino più largo e più leggibile, meglio se stampi molte righe. Entrambi i formati si trovano facilmente online e in cartoleria; la larghezza scelta va poi impostata uguale nel software di cassa, altrimenti il testo va a capo male o viene tagliato. Se sei indeciso e lavori da banco, l'80 mm è la scelta più comoda; in mobilità vince il 58 mm.",
      },
      {
        heading: "ESC/POS: il requisito che non può mancare",
        body: 'ESC/POS è il linguaggio standard di fatto delle stampanti termiche, sviluppato in origine da Epson e supportato dalla quasi totalità dei modelli in commercio. È quello che permette a un software di cassa qualsiasi di pilotare la stampante senza driver proprietari. Nella scheda prodotto cerca la dicitura "ESC/POS compatible": i marchi più diffusi che lo supportano sono Epson, Xprinter, Munbyn, Sunmi e Gprinter. Se la compatibilità ESC/POS non è dichiarata da nessuna parte, lascia perdere il modello — il risparmio di pochi euro non vale il rischio di una stampante che il tuo software non riconosce.',
      },
      {
        heading: "Quanto costa: fasce di prezzo",
        body: "Le portatili Bluetooth da 58 mm partono da 30-60 €. Le stampanti da banco da 80 mm con WiFi o Ethernet stanno tra 60 e 120 €. I marchi premium (Epson TM, Star Micronics) arrivano a 150-250 €, con affidabilità da uso intensivo ma nessuna funzione indispensabile in più per una micro-attività. A questi prezzi va aggiunto solo il consumabile: un rotolo termico costa 0,50-1 € e non esistono cartucce o toner, perché la stampa termica scalda la carta senza inchiostro. In totale, l'intero \"reparto stampa\" di un'attività che emette scontrini da software costa meno di un solo anno di manutenzione di un registratore telematico.",
      },
      {
        heading: "Come si usa con ScontrinoZero",
        body: "ScontrinoZero emette lo scontrino in digitale e la stampa è un passaggio opzionale. Da telefono o tablet il percorso supportato è il Bluetooth: abbini la stampante nelle impostazioni e stampi al volo, ovunque tu sia. Da computer la stampa passa dal normale dialogo di stampa del browser: funziona qualsiasi stampante installata nel sistema operativo, comprese le termiche WiFi ed Ethernet condivise in rete e i modelli USB collegati direttamente. La procedura passo-passo di abbinamento e la risoluzione dei problemi più comuni (rotolo al contrario, larghezza carta sbagliata, standby) sono nell'articolo operativo del centro assistenza, linkato in fondo.",
      },
    ],
    faq: [
      {
        question: "Le stampanti termiche WiFi funzionano con lo smartphone?",
        answer:
          "In genere no, e questo è il limite principale da conoscere: le termiche WiFi economiche non supportano AirPrint (iPhone) né Mopria (Android), i sistemi di stampa nativi dei telefoni. Da smartphone la strada affidabile è il Bluetooth; la WiFi dà il meglio da computer o su postazioni fisse condivise.",
      },
      {
        question:
          "Devo comprare una stampante omologata o dichiararla all'Agenzia delle Entrate?",
        answer:
          "No. La stampante termica è una normale periferica, non un registratore telematico né un misuratore fiscale: il valore fiscale sta nel documento commerciale trasmesso all'AdE, non nella carta. Nessuna omologazione, nessun censimento, nessuna verifica periodica.",
      },
      {
        question: "Posso usare una sola stampante WiFi con più casse?",
        answer:
          "Sì, è proprio il suo vantaggio: essendo collegata alla rete del locale e non a un singolo dispositivo, ogni computer che la installa può stamparci. Con il Bluetooth invece la stampante resta abbinata a un dispositivo per volta.",
      },
      {
        question: "Che carta serve e come si conserva?",
        answer:
          "Rotoli termici da 58 o 80 mm, a seconda della stampante. Non c'è inchiostro: la carta annerisce col calore, quindi i rotoli (e gli scontrini stampati) vanno tenuti lontani da sole e fonti di calore, altrimenti sbiadiscono. Un rotolo costa 0,50-1 €.",
      },
    ],
    relatedHelp: [
      "stampare-scontrino-termica",
      "installare-app",
      "primo-scontrino",
    ],
    relatedGuides: [
      "scontrino-senza-registratore-di-cassa",
      "scegliere-software-scontrini-elettronici",
    ],
  },
};

const GUIDE_SLUG_SET: ReadonlySet<string> = new Set(guideSlugs);

export function isGuideSlug(slug: string): slug is GuideSlug {
  return GUIDE_SLUG_SET.has(slug);
}

export function getGuide(slug: string): GuideArticle {
  if (!isGuideSlug(slug)) {
    throw new Error(`Unknown guide slug: ${slug}`);
  }
  return guideArticles[slug];
}

/** Screenshot del documento commerciale: è un foglio, non un mockup telefono. */
const DOCUMENT_SCREENSHOT = "/screenshots/documento-commerciale.png";

/**
 * Sizing/frame di uno screenshot inline nelle guide. I mockup telefono usano
 * una cornice stretta (`max-w-[240px]`); il documento commerciale — che è un
 * foglio con angoli arrotondati — una più larga (`max-w-[320px] rounded-xl`).
 * Funzione pura → coperta dai test, così la logica non vive solo nella pagina
 * esclusa dalla coverage.
 */
export function guideImageFrame(src: string): {
  readonly className: string;
  readonly sizes: string;
} {
  if (src === DOCUMENT_SCREENSHOT) {
    return {
      className: "mx-auto max-w-[320px] rounded-xl",
      sizes: "(min-width: 768px) 320px, 80vw",
    };
  }
  return {
    className: "mx-auto max-w-[240px]",
    sizes: "(min-width: 768px) 240px, 65vw",
  };
}
