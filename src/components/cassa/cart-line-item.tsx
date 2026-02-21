"use client";

import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CartLine, VAT_LABELS } from "@/types/cassa";

interface CartLineItemProps {
  readonly line: CartLine;
  readonly onRemove: (id: string) => void;
}

export function CartLineItem({ line, onRemove }: CartLineItemProps) {
  const lineTotal = line.grossUnitPrice * line.quantity;

  return (
    <div className="bg-card flex items-start gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{line.description}</p>
        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
          <span>
            {line.quantity} × {formatCurrency(line.grossUnitPrice)}
          </span>
          <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
            {VAT_LABELS[line.vatCode]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-semibold">{formatCurrency(lineTotal)}</span>
        <button
          type="button"
          aria-label="Rimuovi articolo"
          onClick={() => onRemove(line.id)}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg p-1.5 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
