/**
 * Pure plan helpers + types — safe to import from client components.
 *
 * Tieni qui SOLO codice senza dipendenze server (no `getDb`, no Drizzle).
 * Tutto cio' che riguarda la lettura del piano dal DB sta in `plans.ts`,
 * che importa da questo file e re-esporta i symbol pure per i caller server.
 *
 * Motivo: client component bundler analizza ogni modulo che incontra; se
 * `plans.ts` viene tirato dentro perche' un client usa `canUsePro`, Next
 * tenta di bundler-izzare anche `getDb` -> postgres -> module-not-found.
 */

export type Plan =
  | "trial"
  | "starter"
  | "pro"
  | "unlimited"
  | "developer_indie"
  | "developer_business"
  | "developer_scale";

/**
 * Elenco esaustivo dei valori di `Plan`. Mantenere allineato all'union sopra.
 * Esportato per consentire iterazioni e guard runtime in altri moduli.
 */
export const PLAN_VALUES: readonly Plan[] = [
  "trial",
  "starter",
  "pro",
  "unlimited",
  "developer_indie",
  "developer_business",
  "developer_scale",
];

const PLAN_SET: ReadonlySet<string> = new Set(PLAN_VALUES);

/**
 * Type guard runtime: ritorna true se `value` è uno dei `Plan` validi.
 * Usare prima di castare a `Plan` valori provenienti dal DB / dall'esterno
 * per evitare silent drift quando lo schema cambia o un valore "nuovo"
 * viene inserito manualmente.
 */
export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && PLAN_SET.has(value);
}

/** Durata del trial in giorni */
export const TRIAL_DAYS = 30;

/**
 * URL canonico della sezione "Abbonamento" nella pagina settings.
 * Sorgente unica per ogni upsell / CTA "Passa a Pro": cambiandolo qui si
 * propaga ovunque (gate Pro, pulsanti export CSV, banner trial scaduto, ecc.).
 */
export const BILLING_SETTINGS_HREF = "/dashboard/settings#billing";

/** Numero massimo di prodotti nel catalogo per piano Starter e trial */
export const STARTER_CATALOG_LIMIT = 5;

/**
 * Ritorna true se il trial è scaduto (> TRIAL_DAYS giorni fa).
 * Se trialStartedAt è null, considera il trial come scaduto.
 */
export function isTrialExpired(trialStartedAt: Date | null): boolean {
  if (!trialStartedAt) return true;
  const expiryMs = trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= expiryMs;
}

/**
 * Ritorna true se l'utente può emettere scontrini.
 * - trial non scaduto → ✅
 * - starter / pro / unlimited → ✅
 * - trial scaduto → ❌ (sola lettura)
 * - developer_* → ✅ (ma SOLO via Developer API key; la dashboard UI
 *   è gated da `canUseDashboardCashier`, vedi sotto)
 *
 * NB: `canEmit` non riflette il gate UI. Per gateare l'accesso alla
 * pagina `/dashboard/cassa` usare `canUseDashboardCashier(plan)`.
 */
export function canEmit(plan: Plan, trialStartedAt: Date | null): boolean {
  if (plan === "trial") return !isTrialExpired(trialStartedAt);
  return true;
}

/**
 * Ritorna true se l'utente ha accesso alle feature Pro (analytics avanzata,
 * export CSV, AdE sync, supporto prioritario).
 */
export function canUsePro(plan: Plan): boolean {
  return plan === "pro" || plan === "unlimited";
}

/**
 * Ritorna true se il piano è un piano developer (Fase B: Partner API).
 */
export function isDeveloperPlan(plan: Plan): boolean {
  return (
    plan === "developer_indie" ||
    plan === "developer_business" ||
    plan === "developer_scale"
  );
}

/**
 * Ritorna true se il piano può accedere alla dashboard cassa / catalogo UI.
 *
 * Invariante: i piani `developer_*` emettono SOLO via Developer API key e
 * non hanno una UI dashboard di emissione. Le pagine `/dashboard/cassa` e
 * `/dashboard` (catalogo) devono fare un redirect verso `/dashboard/settings`
 * quando questo helper ritorna false, per evitare di esporre una UI che
 * apparirebbe funzionante ma che non riflette il modello d'uso del piano.
 */
export function canUseDashboardCashier(plan: Plan): boolean {
  return !isDeveloperPlan(plan);
}

/**
 * Ritorna true se il piano ha accesso alla Developer API.
 * - Pro e Unlimited: accesso API come feature inclusa nel piano
 * - Developer plans: accesso API con limiti mensili per volume
 */
export function canUseApi(plan: Plan): boolean {
  return canUsePro(plan) || isDeveloperPlan(plan);
}

/**
 * Numero massimo di API key attive (non revocate) per piano.
 * null = nessun limite.
 * Starter/trial non hanno accesso API (canUseApi = false), quindi non
 * hanno una entry qui. I piani Developer sono gestiti nella Fase B.
 */
export const API_KEY_LIMITS: Partial<Record<Plan, number>> = {
  pro: 3,
};

/**
 * Ritorna il limite di API key attive per il piano dato.
 * null significa nessun limite applicato (es. Unlimited, piani Developer).
 */
export function getApiKeyLimit(plan: Plan): number | null {
  return API_KEY_LIMITS[plan] ?? null;
}

/**
 * Limite mensile di scontrini emettibili via API per i piani developer.
 * null = nessun limite (piani non-developer con accesso API).
 */
export const DEVELOPER_MONTHLY_LIMITS: Partial<Record<Plan, number>> = {
  developer_indie: 300,
  developer_business: 1500,
  developer_scale: 5000,
};

/**
 * Ritorna true se l'utente può aggiungere un prodotto al catalogo.
 * - pro / unlimited → sempre true
 * - starter / trial (non scaduto) → solo se currentCount < STARTER_CATALOG_LIMIT
 * - trial scaduto → false
 * - developer_* → true (consumato via API, ma vedi `canUseDashboardCashier`
 *   per il gate UI: la dashboard catalogo non è esposta ai piani developer)
 */
export function canAddCatalogItem(
  plan: Plan,
  trialStartedAt: Date | null,
  currentCount: number,
): boolean {
  if (plan === "pro" || plan === "unlimited" || isDeveloperPlan(plan))
    return true;
  if (plan === "trial" && isTrialExpired(trialStartedAt)) return false;
  return currentCount < STARTER_CATALOG_LIMIT;
}
