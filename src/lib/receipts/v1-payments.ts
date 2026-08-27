import type { PaymentEntry } from "@/lib/receipts/public-request";

/** Voce di pagamento nella forma del contratto pubblico `/api/v1`. */
export interface V1Payment {
  readonly type: PaymentEntry["type"];
  /** Importo in euro, stringa a 2 decimali come `total` e `globalDiscount`. */
  readonly amount: string;
}

/**
 * Rende le voci di pagamento nella forma del contratto `/api/v1`.
 *
 * Gli importi sono **stringhe a 2 decimali**, come ogni altro importo della
 * v1 (`total`, `globalDiscount`): un numero JSON costringerebbe il consumer a
 * fidarsi del float, e sugli importi fiscali quella è la fiducia sbagliata.
 *
 * `null` — non `[]` — quando il documento non porta una ripartizione. Un array
 * vuoto direbbe "nessun pagamento", che è falso su uno scontrino incassato con
 * un metodo solo; `null` dice "questo documento non ha un misto", e il
 * consumer legge `paymentMethod`. È la stessa distinzione che `payments` ha
 * lato lettura (`parsePublicRequest`).
 */
export function v1Payments(
  payments: readonly PaymentEntry[] | null,
): readonly V1Payment[] | null {
  if (!payments) return null;
  return payments.map((row) => ({
    type: row.type,
    amount: (row.amountCents / 100).toFixed(2),
  }));
}
