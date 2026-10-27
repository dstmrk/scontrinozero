"use client";

import { useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLAN_PRICES, type ListedPlan } from "@/lib/plan-prices";

type Billing = "annual" | "monthly";

interface Feature {
  label: string;
}

const starterFeatures: Feature[] = [
  { label: "Scontrini illimitati" },
  { label: "Catalogo fino a 5 prodotti" },
  { label: "Analytics base (KPI a 30 giorni)" },
  { label: "Ricevuta condivisibile via SMS, email e WhatsApp" },
  { label: "Stampa su termica Bluetooth da Android" },
  { label: "Supporto base" },
];

const proFeatures: Feature[] = [
  { label: "Tutto di Starter" },
  { label: "Catalogo illimitato" },
  { label: "Analytics avanzata (grafici e periodi estesi)" },
  { label: "Export CSV degli scontrini" },
  { label: "Messaggio personalizzato sullo scontrino" },
  { label: "Sconti sullo scontrino (di riga e a pagare)" },
  { label: "Pagamento misto (contanti + elettronico)" },
  { label: "Supporto prioritario" },
  { label: "Ricerca documenti commerciali su AdE" },
];

const teamFeatures: Feature[] = [
  { label: "Tutto di Pro" },
  { label: "Collaboratori illimitati" },
  { label: "Ogni collaboratore con il proprio accesso" },
];

interface PricingSectionProps {
  // Precomputed in un server parent via `registerHref`, che ci mette anche la
  // pagina di partenza come `?ref=`. Non risolverlo qui: `APP_HOSTNAME` non è
  // nel bundle client e `NEXT_PUBLIC_APP_URL` è bakata col valore di
  // produzione, quindi ricadrebbe sull'host di produzione anche in sandbox.
  readonly registerHref: string;
}

export function PricingSection({ registerHref }: PricingSectionProps) {
  const [billing, setBilling] = useState<Billing>("annual");

  const isAnnual = billing === "annual";

  return (
    <section id="prezzi" className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-bold">
          I prezzi più bassi del mercato
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-lg text-center">
          30 giorni di prova gratuita.
        </p>

        {/* Toggle mensile / annuale */}
        <div className="mt-8 flex justify-center">
          <div className="bg-muted flex rounded-full p-1">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                billing === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mensile
            </button>
            <button
              type="button"
              onClick={() => setBilling("annual")}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                billing === "annual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annuale
            </button>
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Starter */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">Starter</CardTitle>
              <CardDescription>Per ambulanti e micro-attività</CardDescription>
              <PlanPrice plan="starter" isAnnual={isAnnual} />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {starterFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-2">
                    <Check className="text-primary h-4 w-4 shrink-0" />
                    {f.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="border-primary border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <span>Pro</span>
                <Badge>Consigliato</Badge>
              </CardTitle>
              <CardDescription>
                Per attività con esigenze avanzate
              </CardDescription>
              <PlanPrice plan="pro" isAnnual={isAnnual} />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {proFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-2">
                    <Check className="text-primary h-4 w-4 shrink-0" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Team */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">Team</CardTitle>
              <CardDescription>
                Per chi ha collaboratori in cassa
              </CardDescription>
              <PlanPrice plan="team" isAnnual={isAnnual} />
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {teamFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-2">
                    <Check className="text-primary h-4 w-4 shrink-0" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
              {/* Issue #1099, decisione 7: con CIE o SPID ogni sessione AdE
                  richiede il titolare, quindi con i collaboratori serve
                  Fisconline. Si dichiara prima dell'acquisto. */}
              <p className="text-muted-foreground mt-4 text-xs">
                I collaboratori richiedono le credenziali Fisconline del
                titolare o del gestore incaricato.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <a href={registerHref}>
              Inizia i 30 giorni gratis
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <p className="text-muted-foreground mt-3 text-sm">
            Nessun metodo di pagamento richiesto
          </p>
        </div>
      </div>
    </section>
  );
}

/** Il prezzo di un piano nella card: il mensile, o l'annuale diviso per 12. */
function PlanPrice({
  plan,
  isAnnual,
}: Readonly<{ plan: ListedPlan; isAnnual: boolean }>) {
  const prices = PLAN_PRICES[plan];
  if (!isAnnual) {
    return (
      <div className="mt-2">
        <span className="text-3xl font-bold">{prices.monthly}</span>
        <span className="text-muted-foreground text-sm">/mese</span>
        <p className="text-muted-foreground mt-1 text-sm">
          {`o ${prices.yearly}/anno (equivalente ${prices.yearlyPerMonth}/mese)`}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold">{prices.yearlyPerMonth}</span>
        <span className="text-muted-foreground text-sm line-through">
          {prices.monthly}
        </span>
        <span className="text-muted-foreground text-sm">/mese</span>
        <Badge variant="secondary" className="text-xs">
          {`−${prices.yearlyDiscountPercent}% vs mensile`}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        {`${prices.yearly}/anno (un solo addebito)`}
      </p>
    </div>
  );
}
