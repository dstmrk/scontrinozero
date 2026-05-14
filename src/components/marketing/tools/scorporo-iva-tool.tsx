"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { splitVat, type VatSplitResult } from "@/lib/strumenti/scorporo-iva";
import { formatCurrency } from "@/lib/utils";

const STANDARD_RATES = [4, 5, 10, 22] as const;

export function ScorporoIvaTool() {
  const grossId = useId();
  const rateId = useId();
  const [gross, setGross] = useState("");
  const [rate, setRate] = useState<string>("22");
  const [result, setResult] = useState<VatSplitResult | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const grossNum = Number.parseFloat(gross.replace(",", "."));
    const rateNum = Number.parseFloat(rate.replace(",", "."));
    setResult(splitVat({ grossAmount: grossNum, vatRate: rateNum }));
  };

  return (
    <div className="bg-card mt-6 rounded-lg border p-5">
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <div>
          <Label htmlFor={grossId}>{"Importo lordo (€)"}</Label>
          <Input
            id={grossId}
            type="text"
            inputMode="decimal"
            placeholder="122,00"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={rateId}>{"Aliquota IVA (%)"}</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id={rateId}
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
              className="flex-1"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {STANDARD_RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(String(r))}
                className="bg-muted hover:bg-muted/80 rounded px-2 py-0.5 text-xs"
              >
                {r}
                {"%"}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit">{"Scorpora"}</Button>
      </form>

      {result && (
        <div role="status" aria-live="polite" className="mt-5 border-t pt-5">
          {result.ok ? (
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs uppercase">
                  {"Imponibile"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.net)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase">
                  {"IVA"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.vat)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase">
                  {"Lordo"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatCurrency(result.gross)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-destructive text-sm">{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
