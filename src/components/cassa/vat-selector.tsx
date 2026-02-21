"use client";

import { cn } from "@/lib/utils";
import { VatCode, VAT_CODES, VAT_LABELS } from "@/types/cassa";

interface VatSelectorProps {
  readonly value: VatCode;
  readonly onChange: (code: VatCode) => void;
}

export function VatSelector({ value, onChange }: VatSelectorProps) {
  return (
    <div className="flex gap-2">
      {VAT_CODES.map((code) => {
        const selected = code === value;
        return (
          <button
            key={code}
            type="button"
            aria-label={VAT_LABELS[code]}
            aria-pressed={selected}
            onClick={() => onChange(code)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {VAT_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
