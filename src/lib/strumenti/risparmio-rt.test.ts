import { describe, expect, it } from "vitest";
import { computeRtSavings } from "./risparmio-rt";

describe("computeRtSavings", () => {
  it("ritorna oggetto con tutti i campi attesi per un volume valido", () => {
    const result = computeRtSavings({ receiptsPerMonth: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rtCost5y).toBeGreaterThan(0);
    expect(result.scontrinozeroCost5y).toBeGreaterThan(0);
    expect(result.savings).toBe(result.rtCost5y - result.scontrinozeroCost5y);
    expect(result.breakdown.rt).toBeDefined();
    expect(result.breakdown.scontrinozero).toBeDefined();
  });

  it("ScontrinoZero costa meno di RT per volumi piccoli/medi", () => {
    const result = computeRtSavings({ receiptsPerMonth: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savings).toBeGreaterThan(0);
  });

  it("monotonia debole: più volume → costo SZ ≥ stesso o cresce con piano Pro", () => {
    const low = computeRtSavings({ receiptsPerMonth: 10 });
    const high = computeRtSavings({ receiptsPerMonth: 1000 });
    expect(low.ok && high.ok).toBe(true);
    if (!low.ok || !high.ok) return;
    // SZ con piano Starter/Pro fisso annuale: costo non scende mai col volume
    expect(high.scontrinozeroCost5y).toBeGreaterThanOrEqual(
      low.scontrinozeroCost5y,
    );
  });

  it("nessun NaN/Infinity nei totali", () => {
    for (const v of [1, 10, 100, 1000, 5000]) {
      const result = computeRtSavings({ receiptsPerMonth: v });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Number.isFinite(result.rtCost5y)).toBe(true);
      expect(Number.isFinite(result.scontrinozeroCost5y)).toBe(true);
      expect(Number.isFinite(result.savings)).toBe(true);
    }
  });

  it("ritorna ok=false per volume ≤ 0", () => {
    expect(computeRtSavings({ receiptsPerMonth: 0 }).ok).toBe(false);
    expect(computeRtSavings({ receiptsPerMonth: -1 }).ok).toBe(false);
  });

  it("ritorna ok=false per NaN/Infinity", () => {
    expect(computeRtSavings({ receiptsPerMonth: Number.NaN }).ok).toBe(false);
    expect(
      computeRtSavings({ receiptsPerMonth: Number.POSITIVE_INFINITY }).ok,
    ).toBe(false);
  });

  it("breakdown RT include hardware iniziale + canone annuo × 5", () => {
    const result = computeRtSavings({ receiptsPerMonth: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.rt.hardware).toBeGreaterThan(0);
    expect(result.breakdown.rt.annualFees5y).toBeGreaterThan(0);
    expect(
      result.breakdown.rt.hardware + result.breakdown.rt.annualFees5y,
    ).toBe(result.rtCost5y);
  });

  it("breakdown SZ include solo canone annuo × 5 (no hardware)", () => {
    const result = computeRtSavings({ receiptsPerMonth: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.breakdown.scontrinozero.annualPlan5y).toBe(
      result.scontrinozeroCost5y,
    );
  });

  it("valori arrotondati a 2 decimali (eur cents)", () => {
    const result = computeRtSavings({ receiptsPerMonth: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number(result.rtCost5y.toFixed(2))).toBe(result.rtCost5y);
    expect(Number(result.scontrinozeroCost5y.toFixed(2))).toBe(
      result.scontrinozeroCost5y,
    );
    expect(Number(result.savings.toFixed(2))).toBe(result.savings);
  });
});
