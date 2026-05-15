export const guideSlugs = [
  "documento-commerciale-online",
  "scontrino-senza-registratore-di-cassa",
  "differenza-scontrino-ricevuta-fattura",
  "pos-rt-obbligo-2026",
  "scontrino-regime-forfettario",
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
