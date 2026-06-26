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
      "Sì. Puoi generare il documento commerciale e condividerlo in formato digitale. Se necessario, puoi anche usare una stampante compatibile per consegna cartacea.",
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
      "Sì. Puoi stampare il documento commerciale da qualsiasi dispositivo collegato a una stampante. Per le stampanti termiche Bluetooth, la compatibilità dipende dal browser e dal sistema operativo; in alternativa, puoi condividere lo scontrino digitalmente via SMS, email o WhatsApp.",
  },
  {
    question: "Come vengono protette le mie credenziali Fisconline?",
    answer:
      "Le tue credenziali Fisconline vengono cifrate con tecnologia a livello bancario (AES-256-GCM) prima di essere salvate e non vengono mai condivise con terze parti. Vengono usate esclusivamente per eseguire le operazioni che tu richiedi sul portale dell'Agenzia delle Entrate. Se installi la versione gratuita sul tuo server, restano lì e non transitano mai dai nostri sistemi.",
  },
  {
    question: "Cosa succede alla scadenza dei 30 giorni di prova?",
    answer:
      "Alla scadenza, se non hai scelto un piano, l'account passa automaticamente in sola lettura: puoi consultare lo storico dei tuoi scontrini ma non puoi emetterne di nuovi. Non viene effettuato nessun addebito automatico. Puoi attivare un piano in qualsiasi momento per riprendere ad emettere.",
  },
  {
    question: "Qual è la differenza concreta tra Starter e Pro?",
    answer:
      "Starter è pensato per ambulanti e micro-attività: scontrini illimitati, catalogo fino a 5 prodotti rapidi e analytics base. Pro è pensato per chi usa ScontrinoZero tutti i giorni: catalogo prodotti illimitato, analytics avanzata, export CSV degli scontrini e supporto prioritario via email entro 24 ore. Sono inoltre in sviluppo, e saranno inclusi nel piano Pro non appena rilasciati, il recupero documenti dal portale AdE e la sincronizzazione del catalogo da rubrica AdE. Entrambi i piani includono 30 giorni di prova gratuita; durante la prova puoi usare anche l'analytics avanzata e l'export CSV per provarle prima di scegliere il piano.",
  },
  {
    question: "Esiste una versione completamente gratuita?",
    answer:
      "Sì. ScontrinoZero è open source: puoi scaricarlo e installarlo sul tuo server e usarlo gratuitamente per sempre, senza limitazioni di funzionalità. La versione hosted (Starter e Pro) è a pagamento e include hosting, aggiornamenti automatici e supporto.",
  },
] as const;
