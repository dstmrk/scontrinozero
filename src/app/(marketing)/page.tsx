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
import {
  Smartphone,
  Zap,
  Shield,
  Receipt,
  Clock,
  BarChart3,
  ArrowRight,
  Check,
  Github,
} from "lucide-react";
import Link from "next/link";

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

      {/* Problem → Solution */}
      <section className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold">Il problema</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                I registratori telematici costano centinaia di euro, hanno
                canoni annuali di manutenzione, e sono obbligatori per legge.
                <br />
                <br />
                Per un ambulante, un artigiano o una micro-attività, è un costo
                sproporzionato.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold">La soluzione</h2>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                L&apos;Agenzia delle Entrate offre la procedura{" "}
                <strong>&quot;Documento Commerciale Online&quot;</strong> che
                permette di emettere scontrini senza registratore fisico.
                <br />
                <br />
                ScontrinoZero la rende <strong>semplice e veloce</strong>, dal
                tuo smartphone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">Come funziona</h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Tre passi per emettere il tuo primo scontrino elettronico.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Registrati",
                description:
                  "Crea un account e collega le tue credenziali Fisconline.",
                icon: Shield,
              },
              {
                step: "2",
                title: "Emetti lo scontrino",
                description:
                  "Inserisci l'importo, scegli l'aliquota IVA e il metodo di pagamento.",
                icon: Receipt,
              },
              {
                step: "3",
                title: "Trasmissione automatica",
                description:
                  "ScontrinoZero trasmette i corrispettivi all'AdE in automatico.",
                icon: Zap,
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full">
                  <item.icon className="h-6 w-6" />
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

      {/* Features */}
      <section className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">
            Tutto quello che ti serve
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Progettato per micro-attività che vogliono semplicità e risparmio.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Smartphone,
                title: "Mobile-first",
                description:
                  "Installabile come app sul tuo smartphone. Nessun hardware aggiuntivo.",
              },
              {
                icon: Zap,
                title: "Istantaneo",
                description:
                  "Lo scontrino appare emesso subito. La trasmissione avviene in background.",
              },
              {
                icon: Clock,
                title: "Chiusura automatica",
                description:
                  "Chiusura giornaliera dei corrispettivi senza pensieri.",
              },
              {
                icon: BarChart3,
                title: "Dashboard",
                description:
                  "Monitora vendite, totali giornalieri e storico scontrini.",
              },
              {
                icon: Shield,
                title: "Sicuro",
                description:
                  "Le tue credenziali Fisconline sono cifrate e mai condivise con terzi.",
              },
              {
                icon: Github,
                title: "Open source",
                description:
                  "Codice aperto, verificabile. Self-hosting gratuito per sempre.",
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

      {/* Pricing preview */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">
            Il più economico del mercato
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Nessun canone nascosto. Nessun hardware. Prezzi chiari.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "€0",
                period: "per sempre",
                description: "Per provare senza impegno",
                features: [
                  "10 scontrini / mese",
                  "1 dispositivo",
                  "Storico scontrini",
                ],
                cta: "Inizia gratis",
                highlighted: false,
              },
              {
                name: "Starter",
                price: "~€2",
                period: "/ mese",
                description: "Per ambulanti e micro-attività",
                features: [
                  "Scontrini illimitati",
                  "1 dispositivo",
                  "Chiusura giornaliera",
                  "Supporto email",
                ],
                cta: "Scegli Starter",
                highlighted: true,
              },
              {
                name: "Pro",
                price: "~€4",
                period: "/ mese",
                description: "Per attività regolari",
                features: [
                  "Scontrini illimitati",
                  "Multi-dispositivo",
                  "Dashboard avanzata",
                  "Export dati",
                  "Supporto prioritario",
                ],
                cta: "Scegli Pro",
                highlighted: false,
              },
            ].map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.highlighted
                    ? "border-primary shadow-sm"
                    : "border-border/50"
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {plan.highlighted && (
                      <Badge variant="secondary">Consigliato</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-3xl font-extrabold">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {" "}
                      {plan.period}
                    </span>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="text-primary h-4 w-4 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-muted-foreground mt-6 text-center text-sm">
            Prezzi finali definiti al lancio. Self-hosting{" "}
            <Link href="/prezzi" className="text-primary underline">
              sempre gratuito
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Waitlist CTA */}
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

      {/* Self-hosting callout */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-lg font-semibold">Preferisci il self-hosting?</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            ScontrinoZero è open source. Scarica il codice, installa sul tuo
            server e usalo gratis per sempre. Le tue credenziali restano a casa
            tua.
          </p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <a
              href="https://github.com/dstmrk/scontrinozero"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
              Vedi su GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>
    </>
  );
}
