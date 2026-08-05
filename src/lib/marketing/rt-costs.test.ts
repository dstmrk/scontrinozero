import { describe, expect, it } from "vitest";
import { RT_COSTS, rtThreeYearTotalRange, formatRtCostRange } from "./rt-costs";

describe("RT_COSTS", () => {
  it("tiene l'acquisto hardware nella fascia dei modelli da banco", () => {
    expect(RT_COSTS.purchase.min).toBe(400);
    expect(RT_COSTS.purchase.max).toBe(800);
  });

  it("tratta l'installazione come una tantum, non ricorrente", () => {
    expect(RT_COSTS.installation.recurring).toBe(false);
  });

  // Il costo ricorrente OBBLIGATORIO è la verificazione periodica, ogni 2
  // anni: è la voce che il copy presentava come "canone annuo €100-200",
  // gonfiando di ~4x la spesa ricorrente del concorrente.
  it("modella la verificazione come biennale, non annuale", () => {
    expect(RT_COSTS.periodicVerification.everyYears).toBe(2);
    expect(RT_COSTS.periodicVerification.min).toBe(50);
    expect(RT_COSTS.periodicVerification.max).toBe(100);
  });

  it("marca il contratto di assistenza come facoltativo", () => {
    expect(RT_COSTS.assistanceContract.optional).toBe(true);
  });
});

describe("rtThreeYearTotalRange", () => {
  // 400 + 100 + 50 = 550 · 800 + 200 + 100 = 1100, con una sola
  // verificazione dentro il triennio (al 24° mese).
  it("somma acquisto, installazione e una verificazione", () => {
    expect(rtThreeYearTotalRange()).toEqual({ min: 550, max: 1100 });
  });

  it("resta ampiamente sopra il triennio di un abbonamento software", () => {
    const { min } = rtThreeYearTotalRange();
    const proTriennio = 49.99 * 3;
    expect(min).toBeGreaterThan(proTriennio * 3);
  });
});

describe("formatRtCostRange", () => {
  it("formatta una fascia in euro con il separatore di migliaia italiano", () => {
    expect(formatRtCostRange({ min: 550, max: 1100 })).toBe("550-1.100 €");
  });

  it("formatta senza separatore sotto il migliaio", () => {
    expect(formatRtCostRange({ min: 400, max: 800 })).toBe("400-800 €");
  });
});
