/**
 * Calcolatore risparmio: registratore telematico (RT) vs ScontrinoZero su 5 anni.
 *
 * I costi RT vengono da `src/lib/marketing/rt-costs.ts`, la fonte unica del
 * marketing: punto medio di ogni fascia. Si contano solo le voci dovute —
 * acquisto, installazione da tecnico abilitato e la verificazione periodica
 * ogni 2 anni. Il contratto di assistenza resta fuori: è diffuso ma
 * facoltativo, e contarlo come canone annuo gonfiava il risparmio di circa
 * 350 € su 5 anni.
 */

import { RT_COSTS, type CostRange } from "@/lib/marketing/rt-costs";

const SZ_ANNUAL_PLAN_STARTER_EUR = 29.99;
const SZ_ANNUAL_PLAN_PRO_EUR = 49.99;
const STARTER_RECEIPTS_THRESHOLD = 500; // sopra questa soglia consigliamo Pro per analytics + export
const HORIZON_YEARS = 5;

const midpoint = (range: CostRange): number => (range.min + range.max) / 2;

/** Acquisto + installazione: la spesa una tantum del primo giorno. */
const RT_UPFRONT_EUR =
  midpoint(RT_COSTS.purchase) + midpoint(RT_COSTS.installation);

/** Verificazioni che cadono dentro l'orizzonte (al 24° e al 48° mese). */
const RT_VERIFICATIONS_IN_HORIZON = Math.floor(
  HORIZON_YEARS / RT_COSTS.periodicVerification.everyYears,
);

export interface RtSavingsInput {
  readonly receiptsPerMonth: number;
}

export interface RtSavingsBreakdown {
  readonly rt: {
    readonly upfront: number;
    readonly periodicVerifications5y: number;
  };
  readonly scontrinozero: {
    readonly annualPlan5y: number;
    readonly recommendedPlan: "starter" | "pro";
  };
}

export type RtSavingsResult =
  | {
      ok: true;
      rtCost5y: number;
      scontrinozeroCost5y: number;
      savings: number;
      horizonYears: number;
      breakdown: RtSavingsBreakdown;
    }
  | { ok: false; error: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeRtSavings({
  receiptsPerMonth,
}: RtSavingsInput): RtSavingsResult {
  if (!Number.isFinite(receiptsPerMonth)) {
    return { ok: false, error: "Inserisci un numero valido." };
  }
  if (receiptsPerMonth <= 0) {
    return {
      ok: false,
      error: "Il volume mensile di scontrini deve essere maggiore di zero.",
    };
  }

  const recommendedPlan: "starter" | "pro" =
    receiptsPerMonth >= STARTER_RECEIPTS_THRESHOLD ? "pro" : "starter";
  const szAnnualPlan =
    recommendedPlan === "pro"
      ? SZ_ANNUAL_PLAN_PRO_EUR
      : SZ_ANNUAL_PLAN_STARTER_EUR;

  const rtVerifications5y =
    RT_VERIFICATIONS_IN_HORIZON * midpoint(RT_COSTS.periodicVerification);
  const rtCost5y = round2(RT_UPFRONT_EUR + rtVerifications5y);

  const szAnnualPlan5y = round2(szAnnualPlan * HORIZON_YEARS);

  return {
    ok: true,
    rtCost5y,
    scontrinozeroCost5y: szAnnualPlan5y,
    savings: round2(rtCost5y - szAnnualPlan5y),
    horizonYears: HORIZON_YEARS,
    breakdown: {
      rt: {
        upfront: round2(RT_UPFRONT_EUR),
        periodicVerifications5y: round2(rtVerifications5y),
      },
      scontrinozero: {
        annualPlan5y: szAnnualPlan5y,
        recommendedPlan,
      },
    },
  };
}
