"use client";

import { ArrowLeft, ReceiptEuro } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CartLine, PaymentMethod } from "@/types/cassa";
import { CartLineItem } from "./cart-line-item";
import { PaymentMethodSelector } from "./payment-method-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReceiptSummaryProps {
  readonly lines: CartLine[];
  readonly total: number;
  readonly paymentMethod: PaymentMethod;
  readonly onPaymentMethodChange: (method: PaymentMethod) => void;
  readonly onRemoveLine: (id: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly isSubmitting?: boolean;
  readonly lotteryCode?: string;
  readonly onLotteryCodeChange?: (value: string) => void;
}

export function ReceiptSummary({
  lines,
  total,
  paymentMethod,
  onPaymentMethodChange,
  onRemoveLine,
  onSubmit,
  onBack,
  isSubmitting = false,
  lotteryCode = "",
  onLotteryCodeChange,
}: ReceiptSummaryProps) {
  const count = lines.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Torna indietro"
          onClick={onBack}
          className="hover:bg-muted rounded-lg p-2 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold">Riepilogo scontrino</h2>
          <p className="text-muted-foreground text-sm">
            {count} {count === 1 ? "articolo" : "articoli"}
          </p>
        </div>
      </div>

      {/* Lines */}
      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <CartLineItem key={line.id} line={line} onRemove={onRemoveLine} />
        ))}
      </div>

      {/* Total */}
      <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
        <span className="font-medium">Totale</span>
        <span className="text-xl font-bold tabular-nums">
          {formatCurrency(total)}
        </span>
      </div>

      {/* Payment method */}
      <div>
        <p className="text-muted-foreground mb-2 text-sm font-medium">
          Metodo di pagamento
        </p>
        <PaymentMethodSelector
          value={paymentMethod}
          onChange={onPaymentMethodChange}
        />
      </div>

      {/* Lottery code — visible only for electronic payment */}
      {paymentMethod === "PE" && (
        <div>
          <p className="text-muted-foreground mb-1 text-sm font-medium">
            Codice lotteria <span className="font-normal">(opzionale)</span>
          </p>
          <Input
            type="text"
            placeholder="Codice lotteria (8 caratteri)"
            maxLength={8}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            value={lotteryCode}
            disabled={total < 1}
            onChange={(e) => {
              onLotteryCodeChange?.(e.target.value.toUpperCase());
            }}
            className="rounded-xl font-mono uppercase"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            {total < 1
              ? "Non disponibile per importi inferiori a €1,00"
              : "Per la Lotteria degli Scontrini — solo pagamenti con carta"}
          </p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        <ReceiptEuro className="mr-2 h-5 w-5" />
        {isSubmitting ? "Invio in corso…" : "Emetti scontrino"}
      </Button>
    </div>
  );
}
