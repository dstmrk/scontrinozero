export interface VatSplitInput {
  readonly grossAmount: number;
  readonly vatRate: number;
}

export interface VatAddInput {
  readonly netAmount: number;
  readonly vatRate: number;
}

export type VatSplitResult =
  | { ok: true; net: number; vat: number; gross: number }
  | { ok: false; error: string };

const TWO_DECIMALS = 100;

function roundCents(value: number): number {
  return Math.round(value * TWO_DECIMALS) / TWO_DECIMALS;
}

/** Valida un importo (> 0, finito) e un'aliquota (finita, ∈ [0, 100)). */
function validateAmountAndRate(
  amount: number,
  vatRate: number,
  amountLabel: string,
): { ok: false; error: string } | null {
  if (!Number.isFinite(amount) || !Number.isFinite(vatRate)) {
    return { ok: false, error: "Inserisci numeri validi." };
  }
  if (amount <= 0) {
    return { ok: false, error: `${amountLabel} deve essere maggiore di zero.` };
  }
  if (vatRate < 0 || vatRate >= 100) {
    return { ok: false, error: "L'aliquota IVA deve essere tra 0 e 99." };
  }
  return null;
}

export function splitVat({
  grossAmount,
  vatRate,
}: VatSplitInput): VatSplitResult {
  const invalid = validateAmountAndRate(
    grossAmount,
    vatRate,
    "L'importo lordo",
  );
  if (invalid) return invalid;

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

/**
 * Operazione inversa dello scorporo: dato un imponibile netto, aggiunge l'IVA
 * e restituisce netto / IVA / lordo. Stessa aritmetica sui centesimi.
 */
export function addVat({ netAmount, vatRate }: VatAddInput): VatSplitResult {
  const invalid = validateAmountAndRate(netAmount, vatRate, "L'imponibile");
  if (invalid) return invalid;

  const netCents = Math.round(netAmount * TWO_DECIMALS);
  const vatCents = Math.round((netCents * vatRate) / 100);
  const grossCents = netCents + vatCents;

  return {
    ok: true,
    net: roundCents(netCents / TWO_DECIMALS),
    vat: roundCents(vatCents / TWO_DECIMALS),
    gross: roundCents(grossCents / TWO_DECIMALS),
  };
}
