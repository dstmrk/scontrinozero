import { BUSINESS_PROFILE_LIMITS } from "./validation";

/**
 * Identita' dell'attivita': il confronto fra la ragione sociale che finisce
 * sullo scontrino e quella che l'AdE ha registrato sulla partita IVA.
 *
 * Perche' esiste (REVIEW.md #106). `businesses.business_name` lo digita
 * l'utente al primo passo dell'onboarding — campo facoltativo — e da li' va
 * sul PDF, sulla pagina pubblica /r/, sullo scontrino termico e nel
 * cedente/prestatore inviato all'AdE con `modificati: true`. La scelta della
 * partita IVA su cui operare arriva **dopo** (migration 0037): chi rappresenta
 * una societa' ha quindi digitato il proprio nome prima di sapere che avrebbe
 * emesso per conto di ACME SRL. Nessun controllo se ne accorgeva.
 *
 * Puro e client-safe: nessun accesso a DB o rete.
 */

/** Ripulisce una ragione sociale, riducendo a `null` cio' che e' vuoto. */
export function normalizeDenominazione(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Forma canonica per il **solo confronto**: maiuscole e spazi interni
 * ripetuti non distinguono due nomi. La punteggiatura si': "ACME S.R.L." e
 * "ACME SRL" si stampano diversi sullo scontrino, e quale dei due stampare
 * e' una scelta dell'esercente, non un errore da correggere in automatico.
 */
function comparisonKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("it-IT");
}

export interface DenominazioneMismatch {
  /**
   * - `assente`: sullo scontrino non comparirebbe nessuna ragione sociale.
   * - `divergente`: ne comparirebbe una diversa da quella registrata.
   * - `non-applicabile`: divergente, ma la denominazione AdE non entra nel
   *   limite di `business_name` — si mostra, non si offre l'allineamento.
   */
  kind: "assente" | "divergente" | "non-applicabile";
  /** Cio' che comparirebbe oggi sullo scontrino, ripulito. */
  current: string | null;
  /** Cio' che l'AdE ha registrato, ripulito. */
  ade: string;
}

/**
 * Restituisce la divergenza da segnalare all'esercente, o `null` se non c'e'
 * niente da dire.
 *
 * Gate su `utenzaPiva`: si tace sulle utenze "me stesso" (`utenzaPiva` null),
 * dove la P.IVA e' intestata a chi accede. Li' un'insegna diversa dalla
 * denominazione anagrafica — "Da Mario" contro "ROSSI MARIO" — e' la norma,
 * non un difetto, e segnalarla riempirebbe di rumore la stragrande
 * maggioranza degli account per non dire niente di utile.
 */
export function getDenominazioneMismatch(params: {
  businessName: string | null | undefined;
  adeDenominazione: string | null | undefined;
  utenzaPiva: string | null | undefined;
}): DenominazioneMismatch | null {
  const { businessName, adeDenominazione, utenzaPiva } = params;

  if (!utenzaPiva) return null;

  const ade = normalizeDenominazione(adeDenominazione);
  if (!ade) return null;

  const current = normalizeDenominazione(businessName);
  if (current && comparisonKey(current) === comparisonKey(ade)) return null;

  const fits = ade.length <= BUSINESS_PROFILE_LIMITS.businessName;
  let kind: DenominazioneMismatch["kind"];
  if (!fits) {
    kind = "non-applicabile";
  } else if (current) {
    kind = "divergente";
  } else {
    kind = "assente";
  }

  return { kind, current, ade };
}
