export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ScontrinoZero",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  offers: [
    {
      "@type": "Offer",
      name: "Starter",
      price: "5.99",
      priceCurrency: "EUR",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "8.99",
      priceCurrency: "EUR",
    },
  ],
} as const;

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ScontrinoZero",
  url: "https://scontrinozero.it",
} as const;

export const faqPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Serve per forza un registratore telematico fisico?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. ScontrinoZero nasce per permetterti di emettere documento commerciale e trasmettere i corrispettivi senza cassa fisica, usando i canali previsti dall'Agenzia delle Entrate.",
      },
    },
    {
      "@type": "Question",
      name: "ScontrinoZero è adatto alla mia attività?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sì, è pensato per ambulanti, artigiani, professionisti e micro-attività che vogliono una soluzione semplice, economica e utilizzabile da smartphone o PC.",
      },
    },
    {
      "@type": "Question",
      name: "Il servizio è conforme alla normativa italiana?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ScontrinoZero è progettato per seguire i flussi previsti dall'Agenzia delle Entrate per documento commerciale e corrispettivi telematici. Resta sempre responsabilità dell'utente verificare i dati inseriti e gli esiti delle trasmissioni.",
      },
    },
    {
      "@type": "Question",
      name: "Serve una connessione internet per usarlo?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sì. Per inviare i dati ai servizi telematici e sincronizzare la tua operatività, è necessaria una connessione internet attiva.",
      },
    },
    {
      "@type": "Question",
      name: "Posso emettere e condividere lo scontrino in modo digitale?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sì. Puoi generare il documento commerciale e condividerlo in formato digitale. Se necessario, puoi anche usare una stampante compatibile per consegna cartacea.",
      },
    },
    {
      "@type": "Question",
      name: "Quanto costa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Starter a €5,99/mese (o €29,99/anno) e Pro a €8,99/mese (o €49,99/anno). Entrambi includono 30 giorni di prova gratuita, senza inserire alcun metodo di pagamento.",
      },
    },
    {
      "@type": "Question",
      name: "Posso installarlo da solo sul mio server?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sì. ScontrinoZero è open source e puoi installarlo sul tuo server gratuitamente, senza limiti e senza abbonamento.",
      },
    },
  ],
} as const;
