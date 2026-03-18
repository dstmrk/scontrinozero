"use client";

import { useState } from "react";
import Link from "next/link";
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

type Billing = "annual" | "monthly";

interface Feature {
  label: string;
  comingSoon?: boolean;
}

const starterFeatures: Feature[] = [
  { label: "Scontrini illimitati" },
  { label: "Catalogo fino a 5 prodotti" },
  { label: "Analytics base" },
  { label: "Ricevuta condivisibile via SMS, mail e Whatsapp" },
  { label: "Supporto base" },
];

const proFeatures: Feature[] = [
  { label: "Tutto di Starter" },
  { label: "Catalogo illimitato" },
  { label: "Analytics avanzata", comingSoon: true },
  { label: "Export CSV scontrini", comingSoon: true },
  { label: "Recupero documenti commerciali da AdE", comingSoon: true },
  { label: "Sincronizzazione catalogo con portale AdE", comingSoon: true },
  { label: "Supporto prioritario" },
];

export function PricingSection() {
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

        <div className="mx-auto mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
          {/* Starter */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-xl">Starter</CardTitle>
              <CardDescription>Per ambulanti e micro-attività</CardDescription>
              <div className="mt-2">
                {isAnnual ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold">€2,50</span>
                      <span className="text-muted-foreground text-sm line-through">
                        €4,99
                      </span>
                      <span className="text-muted-foreground text-sm">
                        /mese
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        -50%
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      fatturato €29,99/anno
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold">€4,99</span>
                    <span className="text-muted-foreground text-sm">/mese</span>
                  </>
                )}
              </div>
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
                <Badge>Più completo</Badge>
              </CardTitle>
              <CardDescription>
                Per attività con esigenze avanzate
              </CardDescription>
              <div className="mt-2">
                {isAnnual ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold">€4,17</span>
                      <span className="text-muted-foreground text-sm line-through">
                        €8,99
                      </span>
                      <span className="text-muted-foreground text-sm">
                        /mese
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        -54%
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      fatturato €49,99/anno
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold">€8,99</span>
                    <span className="text-muted-foreground text-sm">/mese</span>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {proFeatures.map((f) => (
                  <li key={f.label} className="flex items-center gap-2">
                    <Check className="text-primary h-4 w-4 shrink-0" />
                    {f.label}
                    {f.comingSoon && (
                      <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">
                        coming soon
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <Link href="/register" prefetch={false}>
              Inizia i 30 giorni gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <p className="text-muted-foreground mt-3 text-sm">
            Nessun metodo di pagamento richiesto
          </p>
        </div>
      </div>
    </section>
  );
}
