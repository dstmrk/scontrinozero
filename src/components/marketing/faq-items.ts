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
    question: "Il servizio è conforme alla normativa italiana?",
    answer:
      "ScontrinoZero è progettato per seguire i flussi previsti dall'Agenzia delle Entrate per documento commerciale e corrispettivi telematici. Resta sempre responsabilità dell'utente verificare i dati inseriti e gli esiti delle trasmissioni.",
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
      "Starter a €4,99/mese (o €29,99/anno) e Pro a €8,99/mese (o €49,99/anno). Entrambi includono 30 giorni di prova gratuita, senza inserire alcun metodo di pagamento. Se non scegli un piano alla scadenza, l'account passa in sola lettura: vedi lo storico scontrini ma non puoi emetterne di nuovi.",
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
      "Le tue credenziali Fisconline vengono cifrate con AES-256-GCM prima di essere salvate e non vengono mai condivise con terze parti. Vengono usate esclusivamente per eseguire le operazioni che tu richiedi sul portale dell'Agenzia delle Entrate. Se installi la versione gratuita sul tuo server, restano lì e non transitano mai dai nostri sistemi.",
  },
  {
    question: "Cosa succede alla scadenza dei 30 giorni di prova?",
    answer:
      "Alla scadenza, se non hai scelto un piano, l'account passa automaticamente in sola lettura: puoi consultare lo storico dei tuoi scontrini ma non puoi emetterne di nuovi. Non viene effettuato nessun addebito automatico. Puoi attivare un piano in qualsiasi momento per riprendere ad emettere.",
  },
  {
    question: "Qual è la differenza concreta tra Starter e Pro?",
    answer:
      "Starter è ideale per ambulanti e micro-attività: scontrini illimitati, catalogo fino a 5 prodotti rapidi e analytics base. Pro aggiunge catalogo illimitato, analytics avanzata, export CSV degli scontrini, recupero documenti dal portale AdE e supporto prioritario. Entrambi includono 30 giorni di prova gratuita.",
  },
  {
    question: "Esiste una versione completamente gratuita?",
    answer:
      "Sì. ScontrinoZero è open source: puoi scaricarlo e installarlo sul tuo server e usarlo gratuitamente per sempre, senza limitazioni di funzionalità. La versione hosted (Starter e Pro) è a pagamento e include hosting, aggiornamenti automatici e supporto.",
  },
] as const;
