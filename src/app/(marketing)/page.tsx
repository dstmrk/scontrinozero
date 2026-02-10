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
  Receipt,
  Clock,
  BarChart3,
  Shield,
  CalendarRange,
  Check,
  Github,
  ArrowRight,
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
                icon: Smartphone,
                title: "Basta il telefono",
                description:
                  "Niente registratore, niente cavi, niente rotoli di carta. Apri l'app dal browser e sei operativo.",
              },
              {
                icon: Receipt,
                title: "Scontrino in un tap",
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

      {/* Prezzi */}
      <section id="prezzi" className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold">
            Il più economico sul mercato
          </h2>
          <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
            Nessun canone nascosto. Nessun hardware da comprare.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "€0",
                period: "per sempre",
                description: "Per provare senza impegno",
                features: [
                  "10 scontrini al mese",
                  "1 dispositivo",
                  "Storico scontrini",
                ],
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
                  "Chiusura giornaliera automatica",
                  "Supporto email",
                ],
                highlighted: true,
              },
              {
                name: "Pro",
                price: "~€4",
                period: "/ mese",
                description: "Per chi ha più di un punto cassa",
                features: [
                  "Scontrini illimitati",
                  "Più dispositivi",
                  "Dashboard completa",
                  "Export dati",
                  "Supporto prioritario",
                ],
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
            Prezzi finali definiti al lancio.
          </p>
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
              <Github className="h-4 w-4" />
              GitHub
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>
    </>
  );
}
