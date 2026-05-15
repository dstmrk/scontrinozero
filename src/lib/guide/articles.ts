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
] as const;

export type GuideSlug = (typeof guideSlugs)[number];

export interface GuideSection {
  readonly heading: string;
  readonly body: string;
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
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly readingMinutes: number;
  readonly sections: readonly GuideSection[];
  readonly faq: readonly GuideFaq[];
  readonly relatedHelp: readonly string[];
  readonly relatedGuides: readonly GuideSlug[];
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
    updatedAt: "2026-05",
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
      },
      {
        heading: "Come si emette con ScontrinoZero",
        body: 'ScontrinoZero replica la procedura ufficiale via API: inserisci gli articoli nel carrello, scegli il metodo di pagamento, opzionalmente aggiungi il codice lotteria del cliente, e tocca "Emetti". Il documento viene generato, firmato dalle tue credenziali Fisconline, trasmesso al portale AdE e archiviato nel tuo storico digitale. Tutto in 3-5 secondi.',
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
          "Sì. Il regime forfettario non esonera dall'obbligo di emettere il documento commerciale per le vendite B2C. Le aliquote IVA in fattura sono pari a 0 (operazione fuori campo IVA art. 1 c. 58 L. 190/2014), ma il documento va comunque emesso e trasmesso.",
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
      "Sì, dal 2020 è possibile emettere scontrini elettronici senza registratore telematico, usando il documento commerciale online via portale AdE o app dedicata.",
    heroIntro:
      'Da gennaio 2020 in Italia è possibile emettere lo scontrino senza registratore di cassa fisico: basta usare il "documento commerciale online" tramite il portale Fatture e Corrispettivi dell\'Agenzia delle Entrate, da web o smartphone. Vediamo cosa serve e come si fa nella pratica.',
    publishedAt: "2026-05-14",
    updatedAt: "2026-05",
    readingMinutes: 5,
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
          "L'Agenzia delle Entrate prevede una procedura di emergenza: emetti uno scontrino manuale (anche su carta) annotando i corrispettivi e li trasmetti entro 12 giorni dalla cessazione del guasto. ScontrinoZero rileva l'assenza di connessione e suggerisce la procedura.",
      },
      {
        question: "Devo informare l'Agenzia delle Entrate della mia scelta?",
        answer:
          'No. Non serve nessuna comunicazione preventiva: il DCO è una procedura disponibile a tutti i titolari di partita IVA. Se hai un registratore telematico attivo e decidi di non usarlo più, puoi metterlo in stato "fuori servizio" dal portale.',
      },
    ],
    relatedHelp: ["primo-scontrino", "credenziali-fisconline", "errori-ade"],
    relatedGuides: [
      "documento-commerciale-online",
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
    updatedAt: "2026-05",
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
    updatedAt: "2026-05",
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
    metaTitle: "Scontrino in regime forfettario: come emetterlo nel 2026",
    metaDescription:
      "Anche in regime forfettario devi emettere scontrino al consumatore finale. Come configurare correttamente l'IVA, gestire la lotteria e quali esoneri esistono.",
    heroIntro:
      "Il regime forfettario semplifica molti adempimenti (IVA, ritenute, gestione contabile), ma NON esonera dall'obbligo di emettere scontrino al consumatore finale per le vendite B2C. Vediamo come gestire correttamente l'emissione, l'IVA \"a zero\" e gli aspetti operativi tipici del forfettario.",
    publishedAt: "2026-05-14",
    updatedAt: "2026-05",
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
        body: "Sui documenti emessi da un forfettario, l'IVA è \"fuori campo\" ai sensi dell'art. 1 c. 58 L. 190/2014. Sul DCO va indicata aliquota IVA pari a 0% (o \"esente/non imponibile\" secondo l'interfaccia software) e va riportata la dicitura normativa di esenzione. In ScontrinoZero, in fase di onboarding indichi che sei in regime forfettario e l'app applica la configurazione corretta automaticamente.",
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
          "Sì, ScontrinoZero è progettato anche per i forfettari. In fase di configurazione iniziale indichi il regime e l'app imposta automaticamente le aliquote IVA a 0% e la dicitura normativa di esenzione su tutti gli scontrini emessi.",
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
    ],
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
    updatedAt: "2026-05",
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
        body: "Controlla: codice ATECO compatibile con DCO (la quasi totalità delle attività al pubblico lo sono), regime fiscale (forfettario o ordinario, entrambi gestibili), connessione internet stabile al punto vendita, dispositivo aggiornato (smartphone, tablet, PC). Stima il volume di scontrini medio giornaliero e di picco. Verifica con il commercialista che non ci siano impegni residui di garanzia o assistenza con il fornitore del RT.",
      },
      {
        heading: "Procedura di dismissione del registratore telematico",
        body: 'Accedi a Fatture e Corrispettivi nel portale AdE, sezione "Corrispettivi" → "Gestore ed esercente" → "Ricerca dispositivo". Seleziona il tuo RT e imposta lo stato a "Fuori servizio" o "Dismesso" indicando la data. Non è richiesta alcuna comunicazione preventiva all\'AdE oltre questa dichiarazione: il portale registra la dismissione e da quel momento il dispositivo non è più tenuto a trasmettere.',
      },
      {
        heading: "Attivazione del software e periodo di transizione",
        body: 'Installa il software scelto (es. ScontrinoZero), inserisci P.IVA e dati attività, collega le credenziali Fisconline. Fai 1-2 scontrini di test in giornate a basso volume per familiarizzare con il flusso. Puoi tenere il RT in stato "in servizio" per 7-14 giorni in parallelo come fallback. Quando ti senti pronto, dichiara il RT fuori servizio e passa al 100% software. Nessun adempimento aggiuntivo è richiesto durante la sovrapposizione.',
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
    updatedAt: "2026-05",
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
    updatedAt: "2026-05",
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
          "Tecnicamente sì, l'AdE accetta l'annullamento entro termini ragionevoli. In pratica, se è passato più di un giorno e il cliente è tornato per restituzione, è più corretto trattare il caso come reso (DCO negativo) anziché come annullamento, perché lo scontrino originale ha già documentato un\'operazione reale.",
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
    relatedHelp: ["annullare-scontrino", "errori-ade", "primo-scontrino"],
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
      "La Lotteria degli Scontrini vista dall'esercente: obblighi normativi, come acquisire il codice lotteria, gestire la lotteria istantanea, sanzioni in caso di rifiuto.",
    heroIntro:
      "La Lotteria degli Scontrini è un sistema premio per i consumatori che richiedono lo scontrino elettronico al momento dell'acquisto. Per il commerciante è un adempimento operativo importante: rifiutare il codice lotteria espone a sanzioni. Vediamo cosa devi sapere e cosa devi fare nella pratica quotidiana.",
    publishedAt: "2026-05-15",
    updatedAt: "2026-05",
    readingMinutes: 6,
    sections: [
      {
        heading: "Come funziona la Lotteria degli Scontrini",
        body: "Il consumatore richiede gratuitamente sul sito lotteriadegliscontrini.gov.it un codice personale di 8 caratteri alfanumerici. Quando fa un acquisto, lo presenta all'esercente (cartaceo, smartphone o tessera plastificata): l'esercente lo inserisce nel DCO, il codice viene trasmesso ad AdE insieme allo scontrino, e ad ogni euro di spesa corrispondono uno o più biglietti virtuali per le estrazioni periodiche e istantanee.",
      },
      {
        heading: "Obblighi del commerciante",
        body: "Quando il cliente esibisce il codice lotteria, l'esercente è obbligato per legge ad acquisirlo e trasmetterlo insieme al DCO. Il rifiuto espone a una sanzione amministrativa pecuniaria. L'obbligo riguarda solo i pagamenti elettronici (carta, bancomat, app, bonifico istantaneo) per le estrazioni istantanee, ed estrazioni periodiche per tutti i pagamenti tracciati. Il codice è strettamente personale del cliente: non va memorizzato né riusato.",
      },
      {
        heading: "Come acquisire il codice in fase di emissione",
        body: 'Tutti i software certificati per DCO devono prevedere un campo "codice lotteria" in fase di emissione scontrino. Su ScontrinoZero, prima di confermare l\'emissione, compare un campo opzionale dove inserire il codice (8 caratteri maiuscoli e numeri). Una validazione lato app verifica il formato; il codice corretto viene incluso nel payload AdE come `cfCessionarioCommittente`. Tempo aggiuntivo per scontrino: 5-10 secondi.',
      },
      {
        heading: "Lotteria istantanea vs periodica",
        body: "Lotteria istantanea: vincita comunicata pochi secondi dopo l'emissione del DCO, premi medio-piccoli, valida solo per pagamenti elettronici. Lotteria periodica: estrazioni settimanali, mensili e annuali, premi più alti, valida per pagamenti sia elettronici sia in contanti. Il cliente partecipa automaticamente a tutte le estrazioni applicabili semplicemente con il codice nel DCO. Il commerciante non ha visibilità delle vincite (sono comunicate al cliente).",
      },
      {
        heading: "Sanzioni in caso di rifiuto",
        body: "Rifiutare di acquisire un codice lotteria valido espone a sanzione amministrativa pecuniaria, che può essere applicata anche dalle stesse autorità di controllo che verificano l'emissione regolare dei corrispettivi. La sanzione è incrementata in caso di reiterazione. Il consumatore può segnalare il rifiuto tramite il portale lotteriadegliscontrini.gov.it; le segnalazioni alimentano i controlli AdE/GdF.",
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
          "Sì. La Lotteria degli Scontrini si applica al consumatore finale, non al regime fiscale dell'esercente. Anche da forfettario sei tenuto ad acquisire il codice lotteria quando il cliente lo presenta. Il DCO con IVA 0% include normalmente il campo lotteria.",
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
    updatedAt: "2026-05",
    readingMinutes: 7,
    sections: [
      {
        heading: "Criterio 1: tipologia di emissione supportata",
        body: 'Verifica che il software emetta documento commerciale online via portale Fatture e Corrispettivi (DCO), non un "scontrino interno" non trasmesso. La differenza è enorme: il primo è fiscalmente valido, il secondo no. Il software deve gestire l\'autenticazione sul portale AdE con le tue credenziali Fisconline o SPID e replicare il flusso ufficiale. Cerca riferimenti espliciti al Provvedimento AdE del 28 ottobre 2016.',
      },
      {
        heading: "Criterio 2: dove vengono custodite le tue credenziali AdE",
        body: 'Per emettere DCO il software accede al tuo portale Fatture e Corrispettivi con le tue credenziali Fisconline. Verifica come sono custodite: cifrate at-rest con algoritmi standard (AES-256-GCM), accessibili solo dal tuo server, mai loggate in chiaro. Sospetta dei software che ti chiedono "username e password" via email o moduli web non protetti. Le opzioni self-hosted offrono il massimo controllo: le credenziali restano sul tuo server.',
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
