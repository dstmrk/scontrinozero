"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateLotteryCode } from "@/lib/strumenti/lotteria";

interface VerifyResult {
  readonly ok: boolean;
  readonly message: string;
  readonly code?: string;
}

export function VerificaLotteriaTool() {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateLotteryCode(value);
    if (validation.ok) {
      setResult({
        ok: true,
        message: "Formato valido: 8 caratteri alfanumerici maiuscoli.",
        code: validation.code,
      });
    } else {
      setResult({ ok: false, message: validation.error });
    }
  };

  return (
    <div className="bg-card mt-6 rounded-lg border p-5">
      <form
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
      >
        <div>
          <Label htmlFor={inputId}>{"Codice lotteria"}</Label>
          <Input
            id={inputId}
            type="text"
            placeholder="ABCD1234"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={20}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1 font-mono tracking-wider"
            required
          />
        </div>
        <Button type="submit">{"Verifica"}</Button>
      </form>

      {result && (
        <div
          role="status"
          aria-live="polite"
          className={
            "mt-5 flex items-start gap-3 rounded-md border p-4 text-sm " +
            (result.ok
              ? "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
              : "border-destructive/20 bg-destructive/5 text-destructive")
          }
        >
          {result.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <p className="font-medium">{result.message}</p>
            {result.ok && result.code && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {result.code}
              </p>
            )}
          </div>
        </div>
      )}

      <p className="text-muted-foreground mt-4 text-xs">
        {
          "Questo tool controlla solo il formato del codice. Non interroga la banca dati AdE: nessun dato viene trasmesso."
        }
      </p>
    </div>
  );
}
