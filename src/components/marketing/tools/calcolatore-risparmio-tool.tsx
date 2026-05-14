"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseItalianNumber } from "@/lib/strumenti/parse-number";
import { computeRtSavings } from "@/lib/strumenti/risparmio-rt";
import { formatCurrency } from "@/lib/utils";

export function CalcolatoreRisparmioTool() {
  const inputId = useId();
  const [value, setValue] = useState("100");
  const [submitted, setSubmitted] = useState<number | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(parseItalianNumber(value));
  };

  const result =
    submitted !== null
      ? computeRtSavings({ receiptsPerMonth: submitted })
      : null;

  return (
    <div className="bg-card mt-6 rounded-lg border p-5">
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div>
          <Label htmlFor={inputId}>{"Scontrini al mese (media)"}</Label>
          <Input
            id={inputId}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            className="mt-1"
          />
        </div>
        <Button type="submit">{"Calcola risparmio"}</Button>
      </form>

      {result && (
        <div role="status" aria-live="polite" className="mt-6 border-t pt-6">
          {result.ok ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">
                    {"Costo RT 5 anni"}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(result.rtCost5y)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase">
                    {"Costo ScontrinoZero 5 anni"}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(result.scontrinozeroCost5y)}
                  </p>
                </div>
                <div>
                  <p className="text-primary text-xs uppercase">
                    {"Risparmio stimato"}
                  </p>
                  <p className="text-primary text-2xl font-semibold tabular-nums">
                    {formatCurrency(result.savings)}
                  </p>
                </div>
              </div>

              <div className="bg-muted/40 rounded-md border p-4 text-sm">
                <p className="font-medium">
                  {"Piano consigliato: "}
                  <span className="text-primary">
                    {result.breakdown.scontrinozero.recommendedPlan === "pro"
                      ? "Pro"
                      : "Starter"}
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {"Dettaglio RT: hardware "}
                  {formatCurrency(result.breakdown.rt.hardware)}
                  {" + canoni e manutenzione su 5 anni "}
                  {formatCurrency(result.breakdown.rt.annualFees5y)}
                  {
                    ". Le stime sono basate su valori medi di mercato (gennaio 2026) e non includono carta termica premium, telecamere o servizi aggiuntivi."
                  }
                </p>
              </div>
            </div>
          ) : (
            <p className="text-destructive text-sm">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
