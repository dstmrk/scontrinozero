import { canUsePro, type Plan } from "@/lib/plans-shared";

/**
 * Messaggio unico del gate sconti, mostrato in cassa e restituito dalla
 * Developer API. Testo singolo perché i due canali devono dire la stessa cosa:
 * un integratore che legge la risposta API e l'esercente che legge la cassa
 * stanno guardando lo stesso limite di piano.
 */
export const DISCOUNTS_PRO_MESSAGE =
  "Gli sconti sullo scontrino sono una funzione del piano Pro.";

/** Il sottoinsieme di `PlanInfo` che serve al gate — client-safe. */
export interface DiscountPlanContext {
  readonly plan: Plan;
  readonly planExpiresAt: Date | null;
  readonly trialStartedAt: Date | null;
}

/** I campi sconto di una richiesta di emissione, tutti opzionali. */
export interface DiscountFields {
  readonly globalDiscount?: number;
  readonly lines?: ReadonlyArray<{ readonly lineDiscount?: number }>;
}

/**
 * Gate di piano per gli sconti sullo scontrino (Pro), applicato **prima** che
 * il documento venga inserito.
 *
 * Un piano insufficiente è un **errore**, non uno sconto ignorato in silenzio:
 * azzerare l'abbuono e trasmettere comunque produrrebbe un documento fiscale
 * irreversibile diverso da quello che l'esercente ha chiesto, e la differenza
 * si vedrebbe solo al momento di incassare.
 *
 * Il gate scatta solo quando uno sconto c'è davvero: uno scontrino senza
 * sconti passa su qualunque piano, compreso un Pro scaduto — l'emissione in sé
 * è governata da `canEmit`, non da qui.
 *
 * Chiamato da entrambi i canali di emissione (server action cassa e
 * `POST /api/v1/receipts`), che hanno già il piano in mano: mantenerlo in una
 * funzione sola evita che i due gate divergano, come già fa `refineSaleBody`
 * per la validazione.
 */
export function discountGateError(
  planContext: DiscountPlanContext,
  fields: DiscountFields,
): string | null {
  // Un gate solo per i due sconti: sono una capability sola per il piano, e
  // due gate separati direbbero all'esercente che sono due cose scollegate
  // proprio dove conta di piu' che capisca che sono due cose DIVERSE.
  const hasDiscount =
    (fields.globalDiscount ?? 0) > 0 ||
    (fields.lines ?? []).some((line) => (line.lineDiscount ?? 0) > 0);
  if (!hasDiscount) return null;

  return canUsePro(
    planContext.plan,
    planContext.planExpiresAt,
    planContext.trialStartedAt,
  )
    ? null
    : DISCOUNTS_PRO_MESSAGE;
}
