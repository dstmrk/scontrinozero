export const faqItems = [
  {
    question: "Serve per forza un registratore telematico fisico?",
    answer:
      "No. ScontrinoZero nasce per permetterti di emettere documento commerciale e trasmettere i corrispettivi senza cassa fisica, usando i canali previsti dall'Agenzia delle Entrate.",
  },
  {
    question: "ScontrinoZero è adatto alla mia attività?",
    answer:
      "Sì, è pensato per ambulanti, artigiani, professionisti e micro-attività che vogliono una soluzione semplice, economica e utilizzabile da smartphone o PC.",
  },
  {
    question:
      "È davvero legale emettere scontrini senza registratore di cassa?",
    answer:
      'Sì. L\'Agenzia delle Entrate prevede da anni una procedura ufficiale chiamata Documento Commerciale Online che permette di emettere scontrini elettronici senza un registratore di cassa fisico. ScontrinoZero usa esattamente quella procedura. Spieghiamo nel dettaglio come funziona nella guida "Documento commerciale online".',
  },
  {
    question: "Serve una connessione internet per usarlo?",
    answer:
      "Sì. Per inviare i dati ai servizi telematici e sincronizzare la tua operatività, è necessaria una connessione internet attiva.",
  },
  {
    question: "Posso emettere e condividere lo scontrino in modo digitale?",
    answer:
      "Sì. Puoi generare il documento commerciale e condividerlo in formato digitale via link o QR code. Se il cliente vuole la carta, su Android puoi stamparlo su una stampante termica Bluetooth; altrove puoi stampare il PDF su qualsiasi stampante collegata al dispositivo.",
  },
  {
    question: "Quanto costa?",
    answer:
      "Starter €4,99/mese o €29,99/anno (equivalente a €2,50/mese). Pro €8,99/mese o €49,99/anno (equivalente a €4,17/mese). Entrambi includono 30 giorni di prova gratuita, senza inserire alcun metodo di pagamento. Se non scegli un piano alla scadenza, l'account passa in sola lettura: vedi lo storico scontrini ma non puoi emetterne di nuovi.",
  },
  {
    question: "È supportata la Lotteria degli Scontrini?",
    answer:
      "Sì. ScontrinoZero supporta la Lotteria degli Scontrini: puoi inserire il codice lotteria del cliente durante l'emissione con pagamento elettronico e viene trasmesso automaticamente all'Agenzia delle Entrate.",
  },
  {
    question: "Posso stampare lo scontrino su carta?",
    answer:
      "Sì. Su Android con Chrome, Edge o Samsung Internet puoi collegare una stampante termica Bluetooth ESC/POS (58 o 80 mm) direttamente da ScontrinoZero e stampare lo scontrino al banco, anche in automatico dopo ogni emissione. Su iPhone, iPad e computer la stampa Bluetooth diretta non è disponibile perché il browser non la supporta: lì il bottone Stampa apre il PDF dello scontrino, già formattato a 58 mm, che puoi stampare su qualsiasi stampante collegata al dispositivo. In alternativa puoi sempre condividere lo scontrino digitalmente via SMS, email o WhatsApp.",
  },
  {
    question: "Come vengono protette le mie credenziali AdE?",
    answer:
      "Le tue credenziali per l'Agenzia delle Entrate — Fisconline (codice fiscale, password e PIN) oppure l'email e la password dell'app CIE ID se ti colleghi con la CIE — vengono cifrate con tecnologia a livello bancario (AES-256-GCM) prima di essere salvate e non vengono mai condivise con terze parti. Vengono usate esclusivamente per eseguire le operazioni che tu richiedi sul portale dell'Agenzia delle Entrate. Se installi la versione gratuita sul tuo server, restano lì e non transitano mai dai nostri sistemi.",
  },
  {
    question: "Cosa succede alla scadenza dei 30 giorni di prova?",
    answer:
      "Alla scadenza, se non hai scelto un piano, l'account passa automaticamente in sola lettura: puoi consultare lo storico dei tuoi scontrini ma non puoi emetterne di nuovi. Non viene effettuato nessun addebito automatico. Puoi attivare un piano in qualsiasi momento per riprendere ad emettere.",
  },
  {
    question: "Qual è la differenza concreta tra Starter e Pro?",
    answer:
      "Starter è pensato per ambulanti e micro-attività: scontrini illimitati, catalogo fino a 5 prodotti rapidi e analytics base. Pro è pensato per chi usa ScontrinoZero tutti i giorni: catalogo prodotti illimitato, analytics avanzata, export CSV degli scontrini e supporto prioritario via email entro 24 ore. È inoltre in sviluppo, e sarà incluso nel piano Pro non appena rilasciato, il recupero dei documenti commerciali dal portale AdE. Entrambi i piani includono 30 giorni di prova gratuita; durante la prova puoi usare anche l'analytics avanzata e l'export CSV per provarle prima di scegliere il piano.",
  },
  {
    question: "Esiste una versione completamente gratuita?",
    answer:
      "Sì. ScontrinoZero è open source: puoi scaricarlo e installarlo sul tuo server e usarlo gratuitamente per sempre, senza limitazioni di funzionalità. La versione hosted (Starter e Pro) è a pagamento e include hosting, aggiornamenti automatici e supporto.",
  },
] as const;
