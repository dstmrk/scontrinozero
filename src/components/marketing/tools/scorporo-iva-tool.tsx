"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseItalianNumber } from "@/lib/strumenti/parse-number";
import {
  addVat,
  splitVat,
  type VatSplitResult,
} from "@/lib/strumenti/scorporo-iva";
import { cn, formatCurrency } from "@/lib/utils";

const STANDARD_RATES = [4, 5, 10, 22] as const;

type Mode = "split" | "add";

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "split", label: "Scorpora IVA" },
  { value: "add", label: "Aggiungi IVA" },
];

export function ScorporoIvaTool() {
  const amountId = useId();
  const rateId = useId();
  const [mode, setMode] = useState<Mode>("split");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState<string>("22");
  const [result, setResult] = useState<VatSplitResult | null>(null);

  const isSplit = mode === "split";
  const amountLabel = isSplit
    ? "Importo lordo (€)"
    : "Importo netto / imponibile (€)";
  const amountPlaceholder = isSplit ? "122,00" : "100,00";
  const submitLabel = isSplit ? "Scorpora" : "Aggiungi IVA";

  const changeMode = (next: Mode) => {
    setMode(next);
    // Il risultato precedente userebbe le label sbagliate: azzeralo.
    setResult(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountNum = parseItalianNumber(amount);
    const rateNum = parseItalianNumber(rate);
    setResult(
      isSplit
        ? splitVat({ grossAmount: amountNum, vatRate: rateNum })
        : addVat({ netAmount: amountNum, vatRate: rateNum }),
    );
  };

  return (
    <div className="bg-card mt-6 rounded-lg border p-5">
      <div
        role="tablist"
        aria-label="Modalità di calcolo"
        className="bg-muted mb-4 inline-flex rounded-md p-0.5"
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            onClick={() => changeMode(m.value)}
            className={cn(
              "rounded px-3 py-1 text-sm font-medium transition-colors",
              mode === m.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <div>
          <Label htmlFor={amountId}>{amountLabel}</Label>
          <Input
            id={amountId}
            type="text"
            inputMode="decimal"
            placeholder={amountPlaceholder}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
        <Button type="submit">{submitLabel}</Button>
      </form>

      {result && (
        <output aria-live="polite" className="mt-5 block border-t pt-5">
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
        </output>
      )}
    </div>
  );
}
