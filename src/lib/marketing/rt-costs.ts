/**
 * Costi del registratore telematico (RT) — fonte unica per tutto il marketing.
 *
 * Regola "doppia scrittura vietata" (skill `marketing-content`): questi numeri
 * comparivano a mano in otto punti fra guide, categorie e tabella comparativa
 * della homepage, e avevano già divergito. Chi cita un costo RT importa da qui.
 *
 * **Cosa è obbligatorio e cosa no.** Il costo ricorrente imposto dalla norma è
 * la sola verificazione periodica, **ogni 2 anni**. Il "canone annuo di
 * manutenzione" da 100-200 € che si legge in giro è un contratto di assistenza
 * **facoltativo**: esiste sul mercato, ma non è dovuto, e presentarlo come
 * ricorrente obbligatorio gonfia di circa 4x la spesa annua del concorrente.
 * Il confronto con ScontrinoZero regge senza gonfiarlo — 550-1.100 € sul
 * triennio contro ~90-150 € — quindi si usa la versione difendibile.
 */

export interface CostRange {
  readonly min: number;
  readonly max: number;
}

export const RT_COSTS = {
  /** Acquisto del dispositivo: modelli da banco più comuni. */
  purchase: { min: 400, max: 800, recurring: false },
  /** Installazione e attivazione da tecnico abilitato: una tantum. */
  installation: { min: 100, max: 200, recurring: false },
  /** Verificazione periodica obbligatoria: unico costo ricorrente imposto. */
  periodicVerification: { min: 50, max: 100, everyYears: 2, recurring: true },
  /** Contratto di assistenza: diffuso ma non dovuto. Mai come "canone annuo". */
  assistanceContract: { min: 100, max: 200, optional: true },
} as const;

/** Orizzonte su cui si confronta l'RT con un abbonamento software. */
export const RT_COMPARISON_YEARS = 3;

/**
 * Spesa del primo triennio **senza** contratto di assistenza: acquisto +
 * installazione + una verificazione (cade al 24° mese, quindi una sola dentro
 * i 3 anni).
 */
export function rtThreeYearTotalRange(): CostRange {
  const verifications = Math.floor(
    RT_COMPARISON_YEARS / RT_COSTS.periodicVerification.everyYears,
  );
  return {
    min:
      RT_COSTS.purchase.min +
      RT_COSTS.installation.min +
      RT_COSTS.periodicVerification.min * verifications,
    max:
      RT_COSTS.purchase.max +
      RT_COSTS.installation.max +
      RT_COSTS.periodicVerification.max * verifications,
  };
}

/**
 * Formatta una fascia come "550-1.100 €".
 *
 * `useGrouping: true` è esplicito: il default ICU per l'italiano è "min2",
 * che NON raggruppa i numeri di 4 cifre (1100 → "1100" invece di "1.100").
 */
export function formatRtCostRange(range: CostRange): string {
  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { useGrouping: true } as const);
  return `${fmt(range.min)}-${fmt(range.max)} €`;
}
