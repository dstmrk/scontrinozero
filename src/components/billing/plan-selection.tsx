"use client";

import { useState } from "react";
import { CheckoutButton } from "./checkout-button";

type PlanSelectionProps = Readonly<{
  starterMonthly: string;
  starterYearly: string;
  proMonthly: string;
  proYearly: string;
}>;

export function PlanSelection({
  starterMonthly,
  starterYearly,
  proMonthly,
  proYearly,
}: PlanSelectionProps) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const isAnnual = interval === "year";

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-sm font-medium">
        Scegli il tuo piano
      </p>

      {/* Toggle Mensile / Annuale */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setInterval("month")}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            !isAnnual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Mensile
        </button>
        <button
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
              -50%
            </span>
          )}
        </button>
      </div>

      {/* Card piani */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Starter */}
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Starter</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            Scontrini illimitati · catalogo 5 prodotti
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {isAnnual ? "€29.99/anno" : "€4.99/mese"}
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
              {isAnnual ? "€49.99/anno" : "€8.99/mese"}
            </span>
            <CheckoutButton
              priceId={isAnnual ? proYearly : proMonthly}
              label="Scegli"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
