/**
 * Normalizzazione del pagamento in **ingresso** — puro, client-safe.
 *
 * Speculare a `public-request.ts`, che legge il pagamento già persistito: qui
 * si parte da ciò che cassa e Developer API mandano (importi in **euro**) e si
 * arriva alla stessa forma canonica in centesimi, `PaymentEntry`. Le due
 * strade convergono di proposito su `resolvePaymentRows`: l'input appena
 * digitato e il documento riletto dallo storico devono produrre lo stesso
 * scontrino, altrimenti la ristampa diverge dall'originale.
 *
 * Perché un modulo a sé e non dentro `public-request.ts`: quello è il lettore
 * del jsonb, e le sue funzioni degradano sui documenti storici. Qui non c'è
 * niente da degradare — l'input o è valido o lo schema Zod lo ha già
 * rifiutato.
 */

import { byAdeOrder, type PaymentEntry } from "@/lib/receipts/public-request";
import type { PaymentMethod } from "@/types/cassa";

/** Una voce di pagamento come arriva dall'input: importo in **euro**. */
export interface PaymentInput {
  readonly type: PaymentMethod;
  readonly amount: number;
}

/**
 * Converte la ripartizione in ingresso nella forma canonica in centesimi, o
 * `null` quando non c'è una ripartizione da rappresentare.
 *
 * Le voci a zero si scartano: uno slot vuoto non è un incasso, il layout AdE
 * non lo stampa (`HAR.md` voce #17c) e il documento non deve ricordarlo. Se
 * restano zero voci il risultato è `null`, cioè "nessuna ripartizione" — la
 * stessa semantica di `ParsedPublicRequest.payments`.
 *
 * L'ordine è quello canonico del tracciato AdE (`byAdeOrder`, voce #6), lo
 * stesso comparatore che usa la lettura del jsonb. Ordinare **qui** e non solo
 * in `resolvePaymentRows` serve al fingerprint di idempotenza, che confronta
 * l'array così com'è: senza, `[{PE,15},{PC,5}]` e `[{PC,5},{PE,15}]` — lo
 * stesso identico documento — produrrebbero hash diversi, e il retry di uno
 * scontrino PENDING fallirebbe come `IDEMPOTENCY_PAYLOAD_MISMATCH` proprio nel
 * caso in cui la stessa key va riusata per non rischiare un doppione fiscale.
 */
export function toPaymentEntries(
  payments: readonly PaymentInput[] | undefined,
): readonly PaymentEntry[] | null {
  if (!payments || payments.length === 0) return null;

  const entries = payments
    .map((p) => ({ type: p.type, amountCents: Math.round(p.amount * 100) }))
    .filter((p) => p.amountCents > 0)
    .sort(byAdeOrder);

  return entries.length > 0 ? entries : null;
}

/**
 * Somma degli importi in **centesimi interi** (regola 17).
 *
 * Mai in euro: la quadratura AdE (`Σ importi + sconto a pagare = totale`,
 * voce #5) si verifica confrontando interi, e su float `0.1 + 0.2 !== 0.3`
 * rifiuterebbe pagamenti perfettamente quadrati.
 */
export function sumPaymentCents(
  payments: readonly PaymentInput[] | undefined,
): number {
  if (!payments) return 0;
  return payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
}

/**
 * Ripartisce l'incassato fra contanti ed elettronico, dove **l'elettronico è
 * sempre il resto**.
 *
 * È la regola che rende la quadratura AdE (voce #5) vera per costruzione
 * invece che verificata, e vive qui perché la usano in due: il ripartitore in
 * cassa per mostrare le quote, e il submit per comporre il payload. Scritta
 * due volte, un giorno la cassa mostrerebbe una ripartizione e ne
 * trasmetterebbe un'altra — su un documento fiscale irreversibile.
 *
 * `cashCents` viene clampato a `[0, collectedCents]`: oltre, l'elettronico
 * diventerebbe negativo.
 */
export function splitCashElectronic(
  collectedCents: number,
  cashCents: number,
): { readonly cashCents: number; readonly electronicCents: number } {
  const collected = Math.max(collectedCents, 0);
  const cash = Math.min(Math.max(cashCents, 0), collected);
  return { cashCents: cash, electronicCents: collected - cash };
}

/**
 * Il documento incassa su **più di una** modalità.
 *
 * Si contano solo le voci che incassano davvero: `[{PC, 0}, {PE, 3}]` è un
 * pagamento elettronico con uno slot vuoto accanto, non un misto. Gatearlo
 * come misto negherebbe a uno Starter un pagamento che misto non è, e
 * squalificherebbe il codice lotteria di un documento che invece lo ammette
 * (voce #13).
 */
export function isMixedPayment(
  payments: readonly PaymentInput[] | undefined,
): boolean {
  return (toPaymentEntries(payments)?.length ?? 0) > 1;
}
