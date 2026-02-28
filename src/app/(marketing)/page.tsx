import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { FaqSection } from "@/components/marketing/faq-section";
import {
  Smartphone,
  ReceiptEuro,
  Clock,
  BarChart3,
  Shield,
  CalendarRange,
  ArrowRight,
  Gift,
  Zap,
  Building,
} from "lucide-react";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="px-4 py-20 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4">
            Presto disponibile
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">
            Lo scontrino elettronico
            <br />
            <span className="text-primary">dal tuo smartphone</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg">
            Emetti scontrini e trasmetti i corrispettivi all&apos;Agenzia delle
            Entrate senza registratore telematico. Il più economico sul mercato.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <WaitlistForm />
            <p className="text-muted-foreground text-xs">
              Niente spam. Ti avvisiamo solo al lancio.
            </p>
          </div>
        </div>
      </section>

      {/* Problema → Soluzione */}
      <section className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold">Il problema</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                I registratori telematici costano centinaia di euro, hanno
                canoni annuali di manutenzione e occupano spazio sul bancone.
                <br />
                <br />
                Per un ambulante, un artigiano o una micro-attività è un costo
                sproporzionato.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold">La soluzione</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                L&apos;Agenzia delle Entrate permette di emettere scontrini
                elettronici senza registratore fisico, tramite la procedura
                &quot;Documento Commerciale Online&quot;.
                <br />
                <br />
                ScontrinoZero la rende <strong>semplice e veloce</strong>: apri
                l&apos;app dal telefono, inserisci l&apos;importo, fatto.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Come funziona */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">Come funziona</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Tre passi per emettere il tuo primo scontrino.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Registrati",
                description:
                  "Crea un account e collega le credenziali Fisconline che usi sul sito dell'Agenzia delle Entrate.",
              },
              {
                step: "2",
                title: "Emetti lo scontrino",
                description:
                  "Inserisci l'importo, scegli l'aliquota IVA e il metodo di pagamento. Un tap e confermi.",
              },
              {
                step: "3",
                title: "Tutto il resto è automatico",
                description:
                  "La trasmissione all'Agenzia delle Entrate e la chiusura giornaliera avvengono da sole.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold">
                  {item.step}
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Funzionalità */}
      <section id="funzionalita" className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">
            Quello che ti serve, niente di più
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: ReceiptEuro,
                title: "Scontrino in 5 secondi",
                description:
                  "Inserisci l'importo, conferma, fatto. La trasmissione all'Agenzia delle Entrate avviene in automatico.",
              },
              {
                icon: Clock,
                title: "Fine giornata senza pensieri",
                description:
                  "La chiusura dei corrispettivi è automatica. Una cosa in meno a cui pensare a fine giornata.",
              },
              {
                icon: BarChart3,
                title: "Sai sempre quanto hai incassato",
                description:
                  "Totale giornaliero, storico scontrini, tutto a portata di mano. Anche dal computer.",
              },
              {
                icon: Shield,
                title: "Le tue credenziali restano tue",
                description:
                  "Le credenziali Fisconline sono protette e non vengono condivise con nessuno.",
              },
              {
                icon: CalendarRange,
                title: "Paghi come preferisci",
                description:
                  "Mensile, annuale o gratis. Cambi piano quando vuoi, senza vincoli e senza penali.",
              },
              {
                icon: Smartphone,
                title: "Funziona ovunque sei",
                description:
                  "Dal banco al furgone: basta uno smartphone con internet per gestire i tuoi corrispettivi.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="border-border/50">
                <CardHeader className="pb-2">
                  <feature.icon className="text-primary h-5 w-5" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Piani — teaser beta */}
      <section id="prezzi" className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <Badge variant="secondary" className="mx-auto mb-4 block w-fit">
            Beta gratuita
          </Badge>
          <h2 className="text-center text-2xl font-bold">Prezzi in arrivo</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Stiamo definendo i piani. I primi iscritti alla beta avranno accesso
            gratuito a tutte le funzionalità.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Gift,
                name: "Free",
                description:
                  "Per chi vuole provare senza impegno. Sempre gratuito.",
              },
              {
                icon: Zap,
                name: "Starter",
                description:
                  "Per ambulanti e micro-attività. Scontrini illimitati a un prezzo imbattibile.",
              },
              {
                icon: Building,
                name: "Pro",
                description:
                  "Per chi ha più di un punto cassa. Dashboard completa e multi-dispositivo.",
              },
            ].map((plan) => (
              <Card key={plan.name} className="border-border/50 text-center">
                <CardHeader>
                  <plan.icon className="text-primary mx-auto h-8 w-8" />
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Button asChild>
              <a href="#waitlist">
                Iscriviti alla beta gratuita
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Lista d'attesa */}
      <section id="waitlist" className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-bold">Non perderti il lancio</h2>
          <p className="text-muted-foreground mt-2">
            Iscriviti alla lista d&apos;attesa per essere tra i primi a provare
            ScontrinoZero.
          </p>
          <div className="mt-6 flex justify-center">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <Badge variant="secondary" className="mx-auto mb-4 block w-fit">
            Supporto
          </Badge>
          <h2 className="text-center text-2xl font-bold">Domande Frequenti</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-2xl text-center">
            Le risposte rapide ai dubbi più comuni su ScontrinoZero.
          </p>
          <FaqSection />
        </div>
      </section>

      {/* Open source */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-lg font-semibold">Codice aperto, verificabile</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            ScontrinoZero è open source. Se preferisci, puoi installarlo sul tuo
            server e usarlo gratis per sempre.
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a
              href="https://github.com/dstmrk/scontrinozero"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>
    </>
  );
}
