/**
 * Config (pure) dello sweep GDPR di cancellazione utenti inattivi.
 *
 * Tenuto SEPARATO da `inactive-user-prune.ts` (che importa `getDb`/Drizzle/
 * email — server-only e pesante) così `src/instrumentation.ts` può leggere la
 * config al boot per decidere se avviare lo sweep, SENZA tirare dentro l'intera
 * pipeline DB quando la feature è disabilitata (default). Nessuna dipendenza
 * oltre `process.env`.
 */

export type PruneConfig = {
  /** Se false lo sweep non viene avviato (default: feature opt-in). */
  enabled: boolean;
  /** Giorni di inattività oltre cui l'account è cancellabile (default 365). */
  deleteAfterDays: number;
  /** Giorni di preavviso prima della cancellazione (default 30). */
  warnBeforeDays: number;
};

export const DEFAULT_DELETE_AFTER_DAYS = 365;
export const DEFAULT_WARN_BEFORE_DAYS = 30;

/**
 * Legge un intero positivo da una env; ritorna `fallback` se assente, non
 * numerico o ≤ 0 (un valore malformato non deve disabilitare silenziosamente
 * la fase, né produrre soglie assurde negative).
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Costruisce la `PruneConfig` dalle env. `enabled` è opt-in: solo il valore
 * esatto `"true"` (case-insensitive, trimmed) attiva lo sweep — qualsiasi altro
 * valore (assente, "false", "1", "") lo lascia spento, coerente con una feature
 * distruttiva che deve essere accesa esplicitamente per ambiente.
 *
 * ⚠️ Invariante: `warnBeforeDays` DEVE essere < `deleteAfterDays`, altrimenti la
 * finestra di preavviso coinciderebbe/supererebbe la soglia di cancellazione e
 * un utente potrebbe essere cancellato senza un preavviso ≥ warnBeforeDays. Se
 * la config viola l'invariante, `warnBeforeDays` è clampato a `deleteAfterDays`
 * meno un giorno (minimo 1) e la violazione è segnalata dal chiamante.
 */
export function readPruneConfig(
  env: Record<string, string | undefined> = process.env,
): PruneConfig {
  const enabled =
    env.INACTIVE_USER_PRUNE_ENABLED?.trim().toLowerCase() === "true";
  const deleteAfterDays = readPositiveInt(
    env.INACTIVE_USER_DELETE_AFTER_DAYS,
    DEFAULT_DELETE_AFTER_DAYS,
  );
  let warnBeforeDays = readPositiveInt(
    env.INACTIVE_USER_WARN_BEFORE_DAYS,
    DEFAULT_WARN_BEFORE_DAYS,
  );
  if (warnBeforeDays >= deleteAfterDays) {
    warnBeforeDays = Math.max(1, deleteAfterDays - 1);
  }

  return { enabled, deleteAfterDays, warnBeforeDays };
}
