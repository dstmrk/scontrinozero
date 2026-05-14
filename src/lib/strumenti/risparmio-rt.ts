/**
 * Calcolatore risparmio: registratore telematico (RT) vs ScontrinoZero su 5 anni.
 *
 * Le costanti riflettono il TCO medio di mercato per un RT entry-level destinato
 * a una piccola attività italiana (fonte: listini pubblici dei principali
 * distributori RT, gennaio 2026). Sono stime conservative: il TCO reale di un
 * RT cresce con servizi aggiuntivi (carta termica premium, telecamere, ecc.).
 */

const RT_HARDWARE_EUR = 500; // costo medio acquisto + collaudo iniziale
const RT_ANNUAL_FEE_EUR = 150; // canone + manutenzione + verifica biennale ammortizzata
const SZ_ANNUAL_PLAN_STARTER_EUR = 29.99;
const SZ_ANNUAL_PLAN_PRO_EUR = 49.99;
const STARTER_RECEIPTS_THRESHOLD = 500; // sopra questa soglia consigliamo Pro per analytics + export
const HORIZON_YEARS = 5;

export interface RtSavingsInput {
  readonly receiptsPerMonth: number;
}

export interface RtSavingsBreakdown {
  readonly rt: {
    readonly hardware: number;
    readonly annualFees5y: number;
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

  const rtHardware = RT_HARDWARE_EUR;
  const rtAnnualFees5y = RT_ANNUAL_FEE_EUR * HORIZON_YEARS;
  const rtCost5y = round2(rtHardware + rtAnnualFees5y);

  const szAnnualPlan5y = round2(szAnnualPlan * HORIZON_YEARS);

  return {
    ok: true,
    rtCost5y,
    scontrinozeroCost5y: szAnnualPlan5y,
    savings: round2(rtCost5y - szAnnualPlan5y),
    horizonYears: HORIZON_YEARS,
    breakdown: {
      rt: {
        hardware: round2(rtHardware),
        annualFees5y: round2(rtAnnualFees5y),
      },
      scontrinozero: {
        annualPlan5y: szAnnualPlan5y,
        recommendedPlan,
      },
    },
  };
}
