/**
 * Gate di piano del messaggio di cortesia in coda allo scontrino (feature Pro).
 *
 * Vive qui, fra i lettori, e non nei renderer: PDF, termica ESC/POS e pagina
 * pubblica `/r` ricevono una nota già risolta (`string | null`) e non sanno
 * cosa sia un piano. Chi legge il documento dal DB applica questa funzione una
 * volta sola, sul posto dove ha già la riga `profiles` sotto mano.
 *
 * È il secondo dei due punti di enforcement: il primo è la scrittura
 * (`updateReceiptFooterNote`, che rifiuta il salvataggio a chi non è Pro).
 * Averlo anche in lettura è ciò che fa smettere di stampare la nota dopo un
 * downgrade — il valore però resta in tabella e torna da solo al riacquisto,
 * lo stesso trattamento delle API key.
 */

import {
  canUsePro,
  isPlan,
  trialStartWithReferralBonus,
} from "@/lib/plans-shared";
import { normalizeReceiptFooterNote } from "@/lib/receipt-format";

/**
 * I campi di `profiles` che decidono il gate. `plan` è `string | null` perché
 * a schema è `text`: la validazione la fa `isPlan`, non un cast.
 */
export interface ReceiptFooterNoteOwner {
  readonly plan: string | null;
  readonly trialStartedAt: Date | null;
  readonly planExpiresAt: Date | null;
  readonly referralBonusDays: number | null;
}

/**
 * La nota da stampare, o `null` se non va stampata: nota vuota, piano senza
 * accesso Pro, o valore di `profiles.plan` non riconosciuto (drift di schema —
 * si degrada nascondendo un arricchimento, mai rompendo la resa del documento
 * fiscale, regola 19).
 */
export function resolveReceiptFooterNote(
  note: string | null | undefined,
  owner: ReceiptFooterNoteOwner,
): string | null {
  const normalized = normalizeReceiptFooterNote(note);
  if (!normalized) return null;

  if (!isPlan(owner.plan)) return null;

  const unlocked = canUsePro(
    owner.plan,
    owner.planExpiresAt,
    trialStartWithReferralBonus(owner.trialStartedAt, owner.referralBonusDays),
  );

  return unlocked ? normalized : null;
}
