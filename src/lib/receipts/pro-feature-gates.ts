import { canUsePro, type Plan } from "@/lib/plans-shared";
import {
  isMixedPayment,
  type PaymentInput,
} from "@/lib/receipts/payment-input";

/**
 * Gate di piano delle funzioni Pro che entrano in un documento fiscale.
 *
 * Ognuna ha il suo predicato e il suo messaggio, ma condividono la regola
 * che conta: **un piano insufficiente è un errore, non la funzione ignorata
 * in silenzio**. Azzerare uno sconto o collassare una ripartizione e
 * trasmettere comunque produrrebbe un documento irreversibile diverso da
 * quello che l'esercente ha chiesto, e la differenza si vedrebbe solo al
 * momento di incassare.
 *
 * Ogni messaggio è unico e condiviso fra cassa e Developer API: l'integratore
 * che legge la risposta HTTP e l'esercente che guarda la cassa stanno
 * guardando lo stesso limite di piano, e devono leggerne la stessa frase.
 */
export const DISCOUNTS_PRO_MESSAGE =
  "Gli sconti sullo scontrino sono una funzione del piano Pro.";

export const MIXED_PAYMENT_PRO_MESSAGE =
  "Il pagamento misto è una funzione del piano Pro.";

/** Il sottoinsieme di `PlanInfo` che serve ai gate — client-safe. */
export interface ProPlanContext {
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
  planContext: ProPlanContext,
  fields: DiscountFields,
): string | null {
  // Un gate solo per i due sconti: sono una capability sola per il piano, e
  // due gate separati direbbero all'esercente che sono due cose scollegate
  // proprio dove conta di piu' che capisca che sono due cose DIVERSE.
  const hasDiscount =
    (fields.globalDiscount ?? 0) > 0 ||
    (fields.lines ?? []).some((line) => (line.lineDiscount ?? 0) > 0);
  if (!hasDiscount) return null;

  return hasProAccess(planContext) ? null : DISCOUNTS_PRO_MESSAGE;
}

/** Il piano ha accesso alle funzioni Pro visibili (trial attivo compreso). */
function hasProAccess(planContext: ProPlanContext): boolean {
  return canUsePro(
    planContext.plan,
    planContext.planExpiresAt,
    planContext.trialStartedAt,
  );
}

/**
 * Gate di piano per il **pagamento misto** (Pro), applicato prima che il
 * documento venga inserito.
 *
 * Scatta solo quando la ripartizione incassa davvero su più modalità: un
 * `payments` con una voce sola — o con l'altra a zero — è un pagamento
 * singolo dichiarato in forma di array, e passa su qualunque piano. Gatearlo
 * negherebbe a uno Starter un pagamento che misto non è.
 *
 * Vale per entrambi i canali di emissione. Sul canale API il gate è di fatto
 * ridondante — `canUseApi` esclude già Starter (`plans-shared.ts`) — ma i
 * piani `developer_*` passano `canUseApi` **senza** passare `canUsePro`, e
 * per loro questo è l'unico gate che scatta. Lo stesso vale oggi per gli
 * sconti: le due funzioni Pro restano allineate.
 */
export function mixedPaymentGateError(
  planContext: ProPlanContext,
  fields: { payments?: readonly PaymentInput[] },
): string | null {
  if (!isMixedPayment(fields.payments)) return null;
  return hasProAccess(planContext) ? null : MIXED_PAYMENT_PRO_MESSAGE;
}
