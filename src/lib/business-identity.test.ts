import { describe, it, expect } from "vitest";
import {
  normalizeDenominazione,
  getDenominazioneMismatch,
} from "./business-identity";

describe("normalizeDenominazione", () => {
  it("riduce a null i valori assenti o di soli spazi", () => {
    expect(normalizeDenominazione(null)).toBeNull();
    expect(normalizeDenominazione(undefined)).toBeNull();
    expect(normalizeDenominazione("")).toBeNull();
    expect(normalizeDenominazione("   \t \n ")).toBeNull();
  });

  it("conserva il valore ripulito dagli spazi ai bordi", () => {
    expect(normalizeDenominazione("  ACME SRL  ")).toBe("ACME SRL");
  });
});

describe("getDenominazioneMismatch", () => {
  const acme = "ACME SRL";

  it("non segnala nulla quando l'utenza e' 'me stesso'", () => {
    // utenzaPiva null = P.IVA intestata a chi accede. Per una ditta
    // individuale l'insegna diverge legittimamente dalla denominazione
    // anagrafica: segnalarlo sarebbe rumore, non un difetto.
    expect(
      getDenominazioneMismatch({
        businessName: "Da Mario",
        adeDenominazione: "ROSSI MARIO",
        utenzaPiva: null,
      }),
    ).toBeNull();
  });

  // Difende la semplificazione al call-site: la pagina impostazioni passa i
  // tre campi con optional chaining, senza guard sul business.
  it("non segnala nulla quando non c'è nessun business da leggere", () => {
    expect(
      getDenominazioneMismatch({
        businessName: undefined,
        adeDenominazione: undefined,
        utenzaPiva: undefined,
      }),
    ).toBeNull();
  });

  it("non segnala nulla senza una denominazione osservata", () => {
    expect(
      getDenominazioneMismatch({
        businessName: "Qualcosa",
        adeDenominazione: null,
        utenzaPiva: "11111111111",
      }),
    ).toBeNull();
  });

  it("segnala la divergenza su un'utenza scelta", () => {
    expect(
      getDenominazioneMismatch({
        businessName: "Mario Rossi",
        adeDenominazione: acme,
        utenzaPiva: "11111111111",
      }),
    ).toEqual({ kind: "divergente", current: "Mario Rossi", ade: acme });
  });

  it("segnala l'assenza quando sullo scontrino non comparirebbe nulla", () => {
    for (const empty of [null, "", "   "]) {
      expect(
        getDenominazioneMismatch({
          businessName: empty,
          adeDenominazione: acme,
          utenzaPiva: "11111111111",
        }),
      ).toEqual({ kind: "assente", current: null, ade: acme });
    }
  });

  it("ignora maiuscole, spazi ai bordi e spazi interni ripetuti", () => {
    for (const equivalent of ["acme srl", "  ACME   SRL ", "Acme Srl"]) {
      expect(
        getDenominazioneMismatch({
          businessName: equivalent,
          adeDenominazione: acme,
          utenzaPiva: "11111111111",
        }),
      ).toBeNull();
    }
  });

  it("considera diversa una punteggiatura diversa", () => {
    // Nessun match fuzzy: "ACME S.R.L." e "ACME SRL" si stampano diversi, e
    // l'esercente decide lui quale dei due vuole sullo scontrino.
    expect(
      getDenominazioneMismatch({
        businessName: "ACME S.R.L.",
        adeDenominazione: acme,
        utenzaPiva: "11111111111",
      }),
    ).toEqual({ kind: "divergente", current: "ACME S.R.L.", ade: acme });
  });

  it("non propone l'allineamento se la denominazione AdE eccede il limite", () => {
    const tooLong = "A".repeat(121);
    expect(
      getDenominazioneMismatch({
        businessName: "Mario Rossi",
        adeDenominazione: tooLong,
        utenzaPiva: "11111111111",
      }),
    ).toEqual({
      kind: "non-applicabile",
      current: "Mario Rossi",
      ade: tooLong,
    });
  });
});
