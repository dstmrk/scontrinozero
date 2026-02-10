import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import {
  Smartphone,
  Zap,
  Shield,
  Receipt,
  Clock,
  BarChart3,
  Share2,
  Wifi,
  Github,
  CreditCard,
  FileText,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Funzionalità — ScontrinoZero",
  description:
    "Emissione scontrini, trasmissione AdE, chiusura giornaliera, dashboard, PWA mobile-first. Tutto dal tuo smartphone.",
};

const features = [
  {
    icon: Receipt,
    title: "Emissione scontrini",
    description:
      "Tastierino numerico rapido, selezione aliquota IVA (4%, 5%, 10%, 22%, esente), metodo di pagamento (contanti, elettronico, misto).",
  },
  {
    icon: Zap,
    title: "Trasmissione istantanea",
    description:
      "Lo scontrino appare emesso subito grazie all'Optimistic UI. La trasmissione all'Agenzia delle Entrate avviene in background.",
  },
  {
    icon: Clock,
    title: "Chiusura giornaliera",
    description:
      "Chiusura automatica (o manuale) dei corrispettivi a fine giornata. Nessun obbligo di ricordarti.",
  },
  {
    icon: BarChart3,
    title: "Dashboard",
    description:
      "Monitora il totale giornaliero, il conteggio scontrini, e consulta lo storico con filtri per data.",
  },
  {
    icon: Smartphone,
    title: "PWA mobile-first",
    description:
      "Installabile come app dal browser, senza passare dagli store. Funziona su qualsiasi smartphone.",
  },
  {
    icon: Share2,
    title: "Condivisione scontrini",
    description:
      "Invia lo scontrino al cliente via QR code, email o link condivisibile (WhatsApp, SMS).",
  },
  {
    icon: Shield,
    title: "Credenziali cifrate",
    description:
      "Le credenziali Fisconline sono cifrate at-rest (AES-256). Mai visibili in chiaro, mai condivise.",
  },
  {
    icon: CreditCard,
    title: "Codice lotteria",
    description:
      "Supporto per il codice lotteria scontrini: il cliente lo inserisce e viene trasmesso con il documento.",
  },
  {
    icon: FileText,
    title: "Annullamento e reso",
    description:
      "Annulla uno scontrino emesso per errore. Il reso viene trasmesso correttamente all'AdE.",
  },
  {
    icon: Users,
    title: "Multi-dispositivo",
    description:
      "Usa ScontrinoZero da più dispositivi con lo stesso account. Perfetto se hai dipendenti.",
  },
  {
    icon: Wifi,
    title: "Funziona offline",
    description:
      "L'interfaccia è sempre disponibile grazie al service worker. Gli scontrini vengono sincronizzati quando torni online.",
  },
  {
    icon: Github,
    title: "Open source",
    description:
      "Codice sorgente aperto e verificabile. Self-hosting gratuito per sempre con O'Saasy License.",
  },
];

export default function FunzionalitaPage() {
  return (
    <>
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-3xl font-extrabold md:text-4xl">
            Tutto dal tuo smartphone
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-center">
            ScontrinoZero sostituisce il registratore telematico con un&apos;app
            web moderna, veloce e sicura.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border/50">
                <CardHeader className="pb-2">
                  <feature.icon className="text-primary h-5 w-5" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-muted/50 px-4 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-bold">Vuoi essere tra i primi?</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Iscriviti e ti avvisiamo al lancio.
          </p>
          <div className="mt-4 flex justify-center">
            <WaitlistForm />
          </div>
        </div>
      </section>
    </>
  );
}
