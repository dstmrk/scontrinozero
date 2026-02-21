"use client";

import { ArrowLeft, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CartLine, PaymentMethod } from "@/types/cassa";
import { CartLineItem } from "./cart-line-item";
import { PaymentMethodSelector } from "./payment-method-selector";
import { Button } from "@/components/ui/button";

interface ReceiptSummaryProps {
  readonly lines: CartLine[];
  readonly paymentMethod: PaymentMethod;
  readonly onPaymentMethodChange: (method: PaymentMethod) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly isSubmitting?: boolean;
}

export function ReceiptSummary({
  lines,
  paymentMethod,
  onPaymentMethodChange,
  onSubmit,
  onBack,
  isSubmitting = false,
}: ReceiptSummaryProps) {
  const total = lines.reduce(
    (sum, l) => sum + l.grossUnitPrice * l.quantity,
    0,
  );

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
          <CartLineItem key={line.id} line={line} onRemove={() => {}} />
        ))}
      </div>

      {/* Total */}
      <div className="bg-muted flex items-center justify-between rounded-xl px-4 py-3">
        <span className="font-medium">Totale</span>
        <span className="text-xl font-bold">{formatCurrency(total)}</span>
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

      {/* Submit */}
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={onSubmit}
        disabled={isSubmitting}
        aria-label="Emetti scontrino"
      >
        <Receipt className="mr-2 h-5 w-5" />
        {isSubmitting ? "Invio in corso…" : "Emetti scontrino"}
      </Button>
    </div>
  );
}
