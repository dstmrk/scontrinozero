import { describe, expect, it } from "vitest";
import { HOME_COMPARISON_ROWS } from "./page";
import { RT_COSTS, formatRtCostRange } from "@/lib/marketing/rt-costs";

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
    expect(row?.competitor).toBe(formatRtCostRange(RT_COSTS.purchase));
    expect(row?.ours).toBe("0 €");
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
    for (const l of [
      "Senza installazione del tecnico",
      "Senza verificazione periodica",
    ]) {
      const row = label(l);
      expect(row?.competitor, l).toBe(false);
      expect(row?.ours, l).toBe(true);
    }
  });

  /**
   * La tabella rende `true` come ✓ e `false` come ✗. Con etichette che
   * nominano un onere ("Installazione tecnico", "Collaudo biennale") il ✓
   * finiva sotto ScontrinoZero e diceva il contrario del vero: che
   * ScontrinoZero richiede il tecnico. Ogni riga booleana deve nominare un
   * vantaggio, così ✓ significa "ce l'ha".
   */
  it("le righe booleane nominano un vantaggio, non un onere", () => {
    const oneri =
      /^(installazione|collaudo|verificazione|canone|manutenzione)/i;
    for (const row of HOME_COMPARISON_ROWS) {
      if (typeof row.ours !== "boolean") continue;
      expect(row.label, row.label).not.toMatch(oneri);
    }
  });
});
