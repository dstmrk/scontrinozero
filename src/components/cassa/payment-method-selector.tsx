"use client";

import { Banknote, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PaymentMethod,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/types/cassa";

interface PaymentMethodSelectorProps {
  readonly value: PaymentMethod;
  readonly onChange: (method: PaymentMethod) => void;
}

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  PC: <Banknote className="h-6 w-6" />,
  PE: <CreditCard className="h-6 w-6" />,
};

export function PaymentMethodSelector({
  value,
  onChange,
}: PaymentMethodSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PAYMENT_METHODS.map((method) => {
        const selected = method === value;
        return (
          <button
            key={method}
            type="button"
            aria-label={PAYMENT_METHOD_LABELS[method]}
            aria-pressed={selected}
            onClick={() => onChange(method)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
          >
            {METHOD_ICONS[method]}
            <span className="text-sm font-medium">
              {PAYMENT_METHOD_LABELS[method]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
