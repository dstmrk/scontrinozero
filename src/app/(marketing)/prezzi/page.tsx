import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { Check, Server } from "lucide-react";

export const metadata: Metadata = {
  title: "Prezzi — ScontrinoZero",
  description:
    "Il registratore di cassa virtuale più economico. Da €0/mese. Self-hosting gratuito per sempre.",
};

const plans = [
  {
    name: "Free",
    price: "€0",
    period: "per sempre",
    description: "Per provare senza impegno",
    features: [
      "10 scontrini / mese",
      "1 dispositivo",
      "Storico scontrini",
      "Chiusura giornaliera",
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
      "Chiusura giornaliera",
      "Storico completo",
      "Supporto email",
    ],
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
      "Export CSV / Excel",
      "Supporto prioritario",
    ],
    highlighted: false,
  },
];

const competitors = [
  { name: "Billy", price: "€70/anno", perMonth: "~€6/mese" },
  { name: "Scontrina", price: "€80/anno", perMonth: "~€7/mese" },
  { name: "MyCassa", price: "€49/anno", perMonth: "~€4/mese" },
  { name: "Scontrinare", price: "€30/anno", perMonth: "~€2.5/mese" },
  {
    name: "ScontrinoZero",
    price: "da €0/anno",
    perMonth: "da €0/mese",
    highlighted: true,
  },
];

export default function PrezziPage() {
  return (
    <>
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-3xl font-extrabold md:text-4xl">
            Prezzi chiari, nessuna sorpresa
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-center">
            Tutti i piani includono la trasmissione all&apos;Agenzia delle
            Entrate. Nessun costo per scontrino. Nessun hardware.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
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
            Prezzi finali definiti al lancio. Sconto per pagamento annuale.
          </p>
        </div>
      </section>

      {/* Competitor comparison */}
      <section className="bg-muted/50 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold">
            Confronto con i competitor
          </h2>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            Quanto costa un registratore di cassa virtuale in Italia?
          </p>

          <div className="mt-8 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-white">
                  <th className="px-4 py-3 text-left font-medium">Servizio</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Prezzo annuale
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Al mese</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr
                    key={c.name}
                    className={`border-b ${c.highlighted ? "bg-primary/5 font-semibold" : "bg-white"}`}
                  >
                    <td className="px-4 py-3">
                      {c.name}
                      {c.highlighted && (
                        <Badge variant="secondary" className="ml-2">
                          Noi
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{c.price}</td>
                    <td className="px-4 py-3">{c.perMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Self-hosting */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Server className="text-primary mx-auto h-10 w-10" />
          <h2 className="mt-4 text-2xl font-bold">Self-hosting gratuito</h2>
          <p className="text-muted-foreground mt-4 leading-relaxed">
            ScontrinoZero è open source. Installa il software sul tuo server e
            usalo gratis per sempre, senza limiti. Le tue credenziali Fisconline
            restano sul tuo server, nessun dato transita da terzi.
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <a
              href="https://github.com/dstmrk/scontrinozero"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guida all&apos;installazione
            </a>
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-muted/50 px-4 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-bold">
            Iscriviti alla lista d&apos;attesa
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Sarai tra i primi a provarlo.
          </p>
          <div className="mt-4 flex justify-center">
            <WaitlistForm />
          </div>
        </div>
      </section>
    </>
  );
}
