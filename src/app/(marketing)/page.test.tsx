import { describe, expect, it } from "vitest";
import { HOME_COMPARISON_ROWS } from "./page";
import { RT_COSTS } from "@/lib/marketing/rt-costs";

/**
 * La tabella comparativa della homepage è il claim sui costi del concorrente
 * più letto del sito. Prima dichiarava un "Canone annuo €100–200" per il
 * registratore telematico: quella cifra è un contratto di assistenza
 * facoltativo, non un costo dovuto, e gonfiava di ~4x la spesa ricorrente.
 * Le righe derivano ora da `src/lib/marketing/rt-costs.ts`.
 */
describe("HOME_COMPARISON_ROWS", () => {
  const label = (l: string) => HOME_COMPARISON_ROWS.find((r) => r.label === l);

  it("non dichiara più un canone annuo per il registratore telematico", () => {
    for (const row of HOME_COMPARISON_ROWS) {
      expect(row.label.toLowerCase()).not.toContain("canone annuo");
      if (typeof row.competitor === "string") {
        expect(row.competitor).not.toMatch(/100.?–.?200|100-200/);
      }
    }
  });

  it("deriva il costo hardware dalla fonte unica", () => {
    const row = label("Costo acquisto hardware");
    expect(row?.competitor).toBe(
      `€${RT_COSTS.purchase.min}–${RT_COSTS.purchase.max}`,
    );
    expect(row?.ours).toBe("€0");
  });

  it("presenta la verificazione periodica come unico ricorrente obbligatorio", () => {
    const row = label("Costi ricorrenti obbligatori");
    expect(row).toBeDefined();
    expect(row?.competitor).toContain(
      `ogni ${RT_COSTS.periodicVerification.everyYears} anni`,
    );
    expect(row?.competitor).toContain(`${RT_COSTS.periodicVerification.min}`);
  });

  it("mantiene le righe booleane sui vincoli che l'RT impone", () => {
    for (const l of ["Installazione tecnico", "Collaudo biennale"]) {
      const row = label(l);
      expect(row?.competitor, l).toBe(false);
      expect(row?.ours, l).toBe(true);
    }
  });
});
