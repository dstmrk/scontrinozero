"use client";

import { useState } from "react";
import type { AdeLoginMethod } from "@/lib/ade/types";
import { useIsNativeShell } from "@/lib/native/native-shell";
import { PLAN_PRICES, type ListedPlan } from "@/lib/plan-prices";
import { CheckoutButton } from "./checkout-button";

type PlanSelectionProps = Readonly<{
  starterMonthly: string;
  starterYearly: string;
  proMonthly: string;
  proYearly: string;
  teamMonthly: string;
  teamYearly: string;
  /** Come il titolare accede oggi all'AdE: decide l'avviso sotto Team. */
  adeLoginMethod: AdeLoginMethod;
}>;

function priceLabel(plan: ListedPlan, isAnnual: boolean): string {
  const prices = PLAN_PRICES[plan];
  return isAnnual ? `${prices.yearly}/anno` : `${prices.monthly}/mese`;
}

const INTERACTIVE_LOGIN_LABELS: Partial<Record<AdeLoginMethod, string>> = {
  cie: "CIE",
  spid: "SPID",
};

/**
 * Scelta del piano con prezzi e checkout Stripe. Nel guscio nativo non rende
 * nulla: dall'app non ci si abbona (issue #1044). Il guard sta qui, non nei
 * call site, così copre anche `CheckoutButton`, che vive solo dentro questo
 * componente.
 */
export function PlanSelection({
  starterMonthly,
  starterYearly,
  proMonthly,
  proYearly,
  teamMonthly,
  teamYearly,
  adeLoginMethod,
}: PlanSelectionProps) {
  const [interval, setInterval] = useState<"month" | "year">("year");
  const native = useIsNativeShell();
  const isAnnual = interval === "year";

  if (native) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-sm font-medium">
        Scegli il tuo piano
      </p>

      {/* Toggle Mensile / Annuale */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setInterval("month")}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            isAnnual
              ? "text-muted-foreground hover:text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          Mensile
        </button>
        <button
          type="button"
          onClick={() => setInterval("year")}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            isAnnual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Annuale
          {isAnnual && (
            <span className="rounded bg-green-100 px-1 py-0.5 text-xs font-semibold text-green-700">
              -{PLAN_PRICES.starter.yearlyDiscountPercent}%
            </span>
          )}
        </button>
      </div>

      {/* Card piani */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Starter */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Starter</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            Scontrini illimitati · catalogo 5 prodotti
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {priceLabel("starter", isAnnual)}
            </span>
            <CheckoutButton
              priceId={isAnnual ? starterYearly : starterMonthly}
              label="Scegli"
              variant="outline"
            />
          </div>
        </div>

        {/* Pro */}
        <div className="rounded-lg border-2 border-blue-500 p-4">
          <h3 className="font-semibold">Pro</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            Catalogo illimitato · analytics · export
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {priceLabel("pro", isAnnual)}
            </span>
            <CheckoutButton
              priceId={isAnnual ? proYearly : proMonthly}
              label="Scegli"
            />
          </div>
        </div>

        {/* Team */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Team</h3>
          <p className="text-muted-foreground mb-2 text-sm">
            Tutto di Pro · collaboratori illimitati
          </p>
          <p className="text-muted-foreground mb-4 text-xs">
            I collaboratori richiedono le credenziali Fisconline.
          </p>
          <TeamLoginNotice adeLoginMethod={adeLoginMethod} />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {priceLabel("team", isAnnual)}
            </span>
            <CheckoutButton
              priceId={isAnnual ? teamYearly : teamMonthly}
              label="Scegli"
              variant="outline"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Con CIE o SPID ogni nuova sessione AdE richiede il titolare, quindi i
 * collaboratori emettono solo con Fisconline (issue #1099, decisione 7). Chi
 * oggi entra così lo legge prima di comprare Team, insieme ai tempi: con la
 * richiesta online le ultime 6 cifre del PIN arrivano per posta.
 */
function TeamLoginNotice({
  adeLoginMethod,
}: Readonly<{ adeLoginMethod: AdeLoginMethod }>) {
  const label = INTERACTIVE_LOGIN_LABELS[adeLoginMethod];
  if (!label) return null;
  return (
    <p
      role="note"
      className="mb-4 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      Oggi accedi all&apos;AdE con {label}: per invitare collaboratori dovrai
      passare a Fisconline. Se le chiedi online, le ultime 6 cifre del PIN
      arrivano per posta entro 15 giorni.{" "}
      <a
        href="/help/credenziali-fisconline"
        className="font-medium underline underline-offset-4"
      >
        Come ottenere le credenziali
      </a>
    </p>
  );
}
