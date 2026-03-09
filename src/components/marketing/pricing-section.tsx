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
  { label: "Chiusura giornaliera automatica" },
  { label: "Catalogo fino a 5 prodotti" },
  { label: "Analytics base" },
  { label: "PDF e link condivisibile" },
];

const proFeatures: Feature[] = [
  { label: "Tutto di Starter" },
  { label: "Catalogo illimitato" },
  { label: "Analytics avanzata", comingSoon: true },
  { label: "Export CSV scontrini", comingSoon: true },
  { label: "Sync catalogo da AdE" },
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
          30 giorni gratis, nessun metodo di pagamento richiesto.
        </p>

        {/* Toggle mensile / annuale */}
        <div className="mt-8 flex flex-col items-center gap-2">
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
          {isAnnual && (
            <Badge variant="secondary" className="text-xs">
              Risparmia fino al 58%
            </Badge>
          )}
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-6 pt-4 md:grid-cols-2">
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
                        €5,99
                      </span>
                      <span className="text-muted-foreground text-sm">/mese</span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      fatturato €29,99/anno
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold">€5,99</span>
                    <span className="text-muted-foreground text-sm">/mese</span>
                    <p className="text-muted-foreground mt-1 text-sm">
                      o €29,99/anno — risparmia il 58%
                    </p>
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
          <Card className="border-primary relative border-2">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge>Più completo</Badge>
            </div>
            <CardHeader>
              <CardTitle className="text-xl">Pro</CardTitle>
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
                      <span className="text-muted-foreground text-sm">/mese</span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      fatturato €49,99/anno
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-bold">€8,99</span>
                    <span className="text-muted-foreground text-sm">/mese</span>
                    <p className="text-muted-foreground mt-1 text-sm">
                      o €49,99/anno — risparmia il 54%
                    </p>
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
            <Link href="/register">
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
