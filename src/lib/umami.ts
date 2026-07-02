/**
 * Web-analytics Umami (self-hosted, cookieless).
 *
 * NB: è cosa distinta dal dominio "analytics" business (KPI dashboard in
 * `src/server/analytics-actions.ts` e `src/components/analytics/*`). Qui è il
 * tracking web/eventi lato client verso l'istanza Umami.
 */

/** Payload ammesso da `umami.track` — solo dati aggregati, mai PII. */
export type UmamiEventData = Record<string, string | number | boolean>;

interface UmamiApi {
  track: (event: string, data?: UmamiEventData) => void;
}

declare global {
  interface Window {
    umami?: UmamiApi;
  }
}

/**
 * Nomi evento stabili. Come i fingerprint Sentry: cambiarli **perde la
 * continuità storica** del report. Set curato (vedi PLAN.md) — mantenerlo
 * piccolo.
 */
export const UMAMI_EVENTS = {
  receiptEmitted: "receipt_emitted",
  planUpgradeClick: "plan_upgrade_click",
  onboardingStepCompleted: "onboarding_step_completed",
} as const;

/**
 * Invia un evento custom a Umami.
 *
 * No-op **sicuro** quando lo script non è caricato: env non configurata
 * (regola 18), ad-blocker, browser ostile, o esecuzione SSR. Non lancia mai —
 * la telemetria non deve rompere il flusso utente (coerente con regola 19/20).
 */
export function track(event: string, data?: UmamiEventData): void {
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami) return;
  try {
    umami.track(event, data);
  } catch {
    // no-op: un fallimento della telemetria non deve propagarsi al chiamante
  }
}
