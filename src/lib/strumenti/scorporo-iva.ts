export interface VatSplitInput {
  readonly grossAmount: number;
  readonly vatRate: number;
}

export type VatSplitResult =
  | { ok: true; net: number; vat: number; gross: number }
  | { ok: false; error: string };

const TWO_DECIMALS = 100;

function roundCents(value: number): number {
  return Math.round(value * TWO_DECIMALS) / TWO_DECIMALS;
}

export function splitVat({
  grossAmount,
  vatRate,
}: VatSplitInput): VatSplitResult {
  if (!Number.isFinite(grossAmount) || !Number.isFinite(vatRate)) {
    return { ok: false, error: "Inserisci numeri validi." };
  }
  if (grossAmount <= 0) {
    return {
      ok: false,
      error: "L'importo lordo deve essere maggiore di zero.",
    };
  }
  if (vatRate < 0 || vatRate >= 100) {
    return { ok: false, error: "L'aliquota IVA deve essere tra 0 e 99." };
  }

  // cents-based deterministic math (same pattern as computeReceiptTotals)
  const grossCents = Math.round(grossAmount * TWO_DECIMALS);
  const netCents = Math.round(grossCents / (1 + vatRate / 100));
  const vatCents = grossCents - netCents;

  return {
    ok: true,
    net: roundCents(netCents / TWO_DECIMALS),
    vat: roundCents(vatCents / TWO_DECIMALS),
    gross: roundCents(grossCents / TWO_DECIMALS),
  };
}
