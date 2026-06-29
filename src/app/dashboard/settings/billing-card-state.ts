import { isPaidPlanExpired, isTrialExpired, type Plan } from "@/lib/plans";

export type BillingCardState =
  | "trial-active"
  | "trial-expired"
  | "subscribed"
  | "past-due"
  | "unlimited";

export type BillingPlanData = {
  plan: Plan;
  trialStartedAt: Date | null;
  planExpiresAt: Date | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
};

/**
 * Determina lo stato della card "Piano e Abbonamento". Estratta in un modulo
 * dedicato (vs funzione privata di SettingsPage) per testabilità — e per tenere
 * bassa la Cognitive Complexity di SettingsPage (S3776).
 *
 * `past_due` e `unpaid` mappano entrambi su `past-due` (CTA portale): sono gli
 * stati di dunning Stripe in cui il checkout server-side è bloccato
 * (`BILLABLE_STATUSES` in api/stripe/checkout/route.ts — REVIEW #38), quindi la
 * UI deve coerentemente instradare al portale invece di offrire un nuovo
 * checkout che genererebbe una subscription duplicata.
 */
export function computeBillingCardState(
  planData: BillingPlanData | null,
): BillingCardState {
  if (!planData) return "trial-active";
  if (planData.plan === "unlimited") return "unlimited";
  if (
    planData.hasSubscription &&
    (planData.subscriptionStatus === "past_due" ||
      planData.subscriptionStatus === "unpaid")
  )
    return "past-due";
  // Safety-net per webhook `customer.subscription.deleted` persi (REVIEW #31):
  // se il piano pagato e' scaduto oltre la grazia i gate sono gia' read-only
  // (isPaidPlanExpired). La subscription row puo' essere rimasta `active`:
  // senza questo check la card mostrerebbe "Pro attivo" mentre cassa/catalogo/
  // API rispondono sola-lettura. Riusa lo stato read-only "trial-expired".
  // Va DOPO il ramo past_due per non oscurare il dunning legittimo.
  if (isPaidPlanExpired(planData.plan, planData.planExpiresAt))
    return "trial-expired";
  if (planData.hasSubscription && planData.subscriptionStatus === "active")
    return "subscribed";
  if (isTrialExpired(planData.trialStartedAt)) return "trial-expired";
  return "trial-active";
}
