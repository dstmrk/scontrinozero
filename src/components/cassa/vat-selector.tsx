"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VatCode, VAT_CODES, VAT_DESCRIPTIONS } from "@/types/cassa";

interface VatSelectorProps {
  readonly value: VatCode;
  readonly onChange: (code: VatCode) => void;
}

export function VatSelector({ value, onChange }: VatSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as VatCode)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VAT_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {VAT_DESCRIPTIONS[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
