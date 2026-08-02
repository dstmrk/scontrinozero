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
  /**
   * Violazioni rilevate nella config (vuoto se tutto ok). Il chiamante
   * (`register()` in `src/instrumentation.ts`) le logga a `logger.warn` al boot:
   * una soglia distruttiva sbagliata deve essere VISIBILE, non silenziosa.
   */
  warnings: string[];
};

export const DEFAULT_DELETE_AFTER_DAYS = 365;
export const DEFAULT_WARN_BEFORE_DAYS = 30;

/**
 * Floor di sicurezza sulla soglia di cancellazione (REVIEW.md #39). Sotto
 * questo valore lo sweep NON parte: un typo nella env (es. `3` al posto di
 * `365`) porterebbe `warnCutoff` a "adesso" e preavviserebbe TUTTI gli utenti
 * non protetti al primo sweep, cancellandoli il giorno dopo. Su una feature
 * distruttiva e IRREVERSIBILE il fail-safe è non cancellare nessuno.
 *
 * 90 giorni è sotto il default (365) ma abbastanza alto da rendere impossibile
 * una cancellazione di massa accidentale. I test E2E/sandbox che vogliono
 * soglie corte passano la config esplicita a `pruneInactiveUsers(now, config)`
 * (già supportato), non via env.
 */
export const MIN_DELETE_AFTER_DAYS = 90;

/**
 * Legge un intero positivo da una env; ritorna `fallback` se assente, non
 * numerico o ≤ 0 (un valore malformato non deve disabilitare silenziosamente
 * la fase, né produrre soglie assurde negative). Un valore PRESENTE ma
 * malformato è segnalato in `warnings`: il fallback silenzioso è sicuro come
 * comportamento, non come diagnosi.
 */
function readPositiveInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  warnings: string[],
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    warnings.push(
      `${name}="${raw}" non è un intero positivo: uso il default ${fallback}.`,
    );
    return fallback;
  }
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
 * meno un giorno (minimo 1) e la violazione finisce in `warnings`.
 *
 * ⚠️ Floor: `deleteAfterDays` < `MIN_DELETE_AFTER_DAYS` forza `enabled = false`
 * (REVIEW.md #39). Il floor NON può accendere uno sweep spento: agisce solo in
 * direzione fail-safe.
 */
export function readPruneConfig(
  env: Record<string, string | undefined> = process.env,
): PruneConfig {
  const warnings: string[] = [];

  const enabled =
    env.INACTIVE_USER_PRUNE_ENABLED?.trim().toLowerCase() === "true";
  const deleteAfterDays = readPositiveInt(
    "INACTIVE_USER_DELETE_AFTER_DAYS",
    env.INACTIVE_USER_DELETE_AFTER_DAYS,
    DEFAULT_DELETE_AFTER_DAYS,
    warnings,
  );
  let warnBeforeDays = readPositiveInt(
    "INACTIVE_USER_WARN_BEFORE_DAYS",
    env.INACTIVE_USER_WARN_BEFORE_DAYS,
    DEFAULT_WARN_BEFORE_DAYS,
    warnings,
  );
  if (warnBeforeDays >= deleteAfterDays) {
    const clamped = Math.max(1, deleteAfterDays - 1);
    warnings.push(
      `INACTIVE_USER_WARN_BEFORE_DAYS=${warnBeforeDays} ≥ ` +
        `INACTIVE_USER_DELETE_AFTER_DAYS=${deleteAfterDays}: ` +
        `il preavviso è clampato a ${clamped} giorni.`,
    );
    warnBeforeDays = clamped;
  }

  const belowFloor = deleteAfterDays < MIN_DELETE_AFTER_DAYS;
  if (belowFloor) {
    warnings.push(
      `INACTIVE_USER_DELETE_AFTER_DAYS=${deleteAfterDays} è sotto il floor di ` +
        `sicurezza di ${MIN_DELETE_AFTER_DAYS} giorni: lo sweep di cancellazione ` +
        `NON verrà avviato (fail-safe, REVIEW.md #39).`,
    );
  }

  return {
    enabled: enabled && !belowFloor,
    deleteAfterDays,
    warnBeforeDays,
    warnings,
  };
}
