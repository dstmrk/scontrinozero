import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  BarChart3,
  Shield,
  Smartphone,
  Undo2,
  Share2,
  Ticket,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingHero } from "@/components/marketing/marketing-hero";

export const metadata: Metadata = {
  title: "Funzionalità",
  description:
    "Emissione scontrini in 5 secondi, trasmissione automatica all'AdE, annullamento, storico, condivisione digitale e molto altro. Scopri tutte le funzionalità di ScontrinoZero.",
  openGraph: {
    title: "Funzionalità ScontrinoZero | Emissione, Gestione, Compliance AdE",
    description:
      "Emissione scontrini in 5 secondi, trasmissione automatica all'AdE, annullamento, storico e condivisione digitale. Scopri tutto.",
  },
};

const sections = [
  {
    id: "emissione",
    title: "Emissione veloce",
    subtitle: "Uno scontrino in 5 secondi, trasmesso subito all'AdE",
    features: [
      {
        icon: Zap,
        title: "Scontrino in 5 secondi",
        description:
          "Inserisci l'importo, scegli il metodo di pagamento, conferma. La trasmissione all'Agenzia delle Entrate avviene automaticamente ad ogni scontrino.",
      },
      {
        icon: Ticket,
        title: "Lotteria degli Scontrini",
        description:
          "Supporto nativo alla Lotteria degli Scontrini: inserisci il codice lotteria del cliente e viene trasmesso automaticamente all'AdE con il documento commerciale.",
      },
      {
        icon: Clock,
        title: "Multi-metodo pagamento",
        description:
          "Contanti, carte, pagamenti elettronici o misti: scegli il metodo per ogni scontrino. Puoi anche dividere il pagamento tra più modalità.",
      },
    ],
  },
  {
    id: "gestione",
    title: "Gestione e controllo",
    subtitle: "Tutto lo storico a portata di mano, sempre",
    features: [
      {
        icon: Undo2,
        title: "Annullamento scontrini",
        description:
          "Hai inserito un importo errato? Annulla lo scontrino direttamente dall'app. La comunicazione di annullamento viene inviata automaticamente all'AdE.",
      },
      {
        icon: BarChart3,
        title: "Storico e totali",
        description:
          "Visualizza il totale giornaliero, filtra per data e consulta lo storico completo dei tuoi scontrini. Disponibile anche da desktop.",
      },
      {
        icon: Share2,
        title: "Condivisione digitale",
        description:
          "Condividi lo scontrino con il cliente via SMS, email o WhatsApp. Puoi anche stamparlo su qualsiasi stampante collegata al dispositivo.",
      },
    ],
  },
  {
    id: "sicurezza",
    title: "Sicurezza e compliance",
    subtitle: "Credenziali protette, trasmissioni conformi",
    features: [
      {
        icon: Shield,
        title: "Credenziali Fisconline cifrate",
        description:
          "Le tue credenziali Fisconline vengono cifrate con AES-256-GCM e non vengono mai condivise con terze parti. Vengono usate esclusivamente per le operazioni che tu richiedi.",
      },
      {
        icon: ArrowRight,
        title: "Trasmissione AdE automatica",
        description:
          'Ogni documento commerciale viene trasmesso automaticamente all\'Agenzia delle Entrate tramite la procedura ufficiale "Documento Commerciale Online". Nessun passaggio manuale.',
      },
      {
        icon: Ticket,
        title: "Conformità normativa 2026",
        description:
          "ScontrinoZero segue i flussi previsti dall'AdE per corrispettivi telematici. Aggiornamenti automatici inclusi per restare sempre in linea con la normativa.",
      },
    ],
  },
  {
    id: "flessibilita",
    title: "Flessibilità totale",
    subtitle: "Da qualsiasi dispositivo, ovunque tu sia",
    features: [
      {
        icon: Smartphone,
        title: "Multi-dispositivo",
        description:
          "Funziona su smartphone, tablet e desktop. Basta un browser e una connessione internet: nessuna app da installare, nessun hardware aggiuntivo.",
      },
      {
        icon: Zap,
        title: "Zero hardware",
        description:
          "Nessun registratore telematico fisico, nessun tecnico, nessun collaudo biennale. Solo il dispositivo che già usi ogni giorno.",
      },
      {
        icon: Shield,
        title: "Versione self-hosted gratuita",
        description:
          "ScontrinoZero è open source. Puoi scaricarlo e installarlo sul tuo server: tutte le funzionalità, gratuitamente per sempre. Le credenziali Fisconline restano sul tuo server.",
      },
    ],
  },
];

export default function FunzionalitaPage() {
  return (
    <>
      {/* Hero */}
      <MarketingHero
        title={
          <>
            Tutto quello che ti serve,
            <br />
            <span className="text-primary">niente di superfluo</span>
          </>
        }
        subtitle="ScontrinoZero è pensato per chi ha bisogno di emettere scontrini fiscali in modo semplice, veloce e conforme alla normativa italiana."
      >
        <Button asChild size="lg" className="mt-8">
          <Link href="/register" prefetch={false}>
            Prova gratis per 30 giorni
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </MarketingHero>

      {/* Feature sections */}
      {sections.map((section, idx) => (
        <section
          key={section.id}
          id={section.id}
          className={`px-4 py-20 ${idx % 2 === 1 ? "bg-muted/50" : ""}`}
        >
          <div className="mx-auto max-w-5xl">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <p className="text-muted-foreground mt-2">{section.subtitle}</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {section.features.map((feature) => (
                <div key={feature.title} className="flex flex-col gap-3">
                  <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
                    <feature.icon className="text-primary h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Button asChild variant="outline" size="sm">
                <Link href="/register" prefetch={false}>
                  Inizia gratis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      ))}

      {/* CTA finale */}
      <section className="px-4 py-20 text-center">
        <h2 className="text-2xl font-bold">
          Pronto a emettere il tuo primo scontrino?
        </h2>
        <p className="text-muted-foreground mt-2">
          30 giorni gratis. Nessuna carta richiesta. Nessun hardware.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/register" prefetch={false}>
              Inizia gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/prezzi" prefetch={false}>
              Vedi i prezzi
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
