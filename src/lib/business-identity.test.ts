import { describe, it, expect } from "vitest";
import {
  normalizeDenominazione,
  getDenominazioneMismatch,
  getSedeLegaleMismatch,
  getAdeIdentityMismatches,
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

describe("getSedeLegaleMismatch", () => {
  const ADE = {
    indirizzo: "Via Roma",
    numeroCivico: "10",
    cap: "20100",
    comune: "Milano",
    provincia: "MI",
  };
  const CURRENT = {
    address: "Via Roma",
    streetNumber: "10",
    zipCode: "20100",
    city: "Milano",
    province: "MI",
  };
  const UTENZA = "11111111111";

  it("non segnala nulla quando l'utenza è 'me stesso'", () => {
    expect(
      getSedeLegaleMismatch({
        current: { ...CURRENT, city: "Torino" },
        ade: ADE,
        utenzaPiva: null,
      }),
    ).toBeNull();
  });

  it("non segnala nulla quando tutto coincide", () => {
    expect(
      getSedeLegaleMismatch({
        current: CURRENT,
        ade: ADE,
        utenzaPiva: UTENZA,
      }),
    ).toBeNull();
  });

  it("non segnala nulla senza nessun campo osservato", () => {
    expect(
      getSedeLegaleMismatch({
        current: CURRENT,
        ade: {
          indirizzo: null,
          numeroCivico: null,
          cap: null,
          comune: null,
          provincia: null,
        },
        utenzaPiva: UTENZA,
      }),
    ).toBeNull();
  });

  it("elenca solo i campi che divergono, con l'etichetta leggibile", () => {
    const result = getSedeLegaleMismatch({
      current: { ...CURRENT, city: "Torino", zipCode: "10100" },
      ade: ADE,
      utenzaPiva: UTENZA,
    });

    expect(result?.kind).toBe("divergente");
    expect(result?.fields).toEqual([
      { label: "CAP", current: "10100", ade: "20100" },
      { label: "Comune", current: "Torino", ade: "Milano" },
    ]);
  });

  it("tratta un campo nostro vuoto come divergente, se l'AdE ce l'ha", () => {
    const result = getSedeLegaleMismatch({
      current: { ...CURRENT, streetNumber: "  " },
      ade: ADE,
      utenzaPiva: UTENZA,
    });

    expect(result?.fields).toEqual([
      { label: "Civico", current: null, ade: "10" },
    ]);
  });

  // Un campo che l'AdE non ha non è un campo a cui allinearsi: non si può
  // svuotare l'indirizzo stampato perché il portale tace su quel pezzo.
  it("ignora un campo che l'AdE non ha, anche se noi ce l'abbiamo", () => {
    expect(
      getSedeLegaleMismatch({
        current: CURRENT,
        ade: { ...ADE, numeroCivico: "" },
        utenzaPiva: UTENZA,
      }),
    ).toBeNull();
  });

  it("ignora maiuscole e spazi interni ripetuti", () => {
    expect(
      getSedeLegaleMismatch({
        current: { ...CURRENT, address: "  via   roma ", city: "MILANO" },
        ade: ADE,
        utenzaPiva: UTENZA,
      }),
    ).toBeNull();
  });

  // Stesso criterio della denominazione: niente match fuzzy. "10" e "10/A"
  // sono due indirizzi diversi, e quale stampare lo decide l'esercente.
  it("considera diverso un civico con esponente", () => {
    const result = getSedeLegaleMismatch({
      current: { ...CURRENT, streetNumber: "10/A" },
      ade: ADE,
      utenzaPiva: UTENZA,
    });

    expect(result?.fields).toEqual([
      { label: "Civico", current: "10/A", ade: "10" },
    ]);
  });

  // L'AdE pretende la sigla maiuscola in emissione: si confronta e si scrive
  // normalizzata, non com'è arrivata.
  it("normalizza la provincia a maiuscolo prima di confrontarla e scriverla", () => {
    expect(
      getSedeLegaleMismatch({
        current: CURRENT,
        ade: { ...ADE, provincia: "mi" },
        utenzaPiva: UTENZA,
      }),
    ).toBeNull();

    const result = getSedeLegaleMismatch({
      current: { ...CURRENT, province: "RM" },
      ade: { ...ADE, provincia: "mi" },
      utenzaPiva: UTENZA,
    });
    expect(result?.patch).toEqual({ province: "MI" });
  });

  it("restituisce il patch da scrivere, con i soli campi divergenti", () => {
    const result = getSedeLegaleMismatch({
      current: { ...CURRENT, city: "Torino" },
      ade: ADE,
      utenzaPiva: UTENZA,
    });

    expect(result?.patch).toEqual({ city: "Milano" });
  });

  it.each([
    ["indirizzo", { indirizzo: "A".repeat(151) }],
    ["civico", { numeroCivico: "A".repeat(21) }],
    ["comune", { comune: "A".repeat(81) }],
    ["CAP non a 5 cifre", { cap: "2010" }],
    ["provincia non a 2 lettere", { provincia: "MIL" }],
  ])(
    "non propone l'allineamento se l'AdE manda un %s fuori misura",
    (_label, override) => {
      const result = getSedeLegaleMismatch({
        current: { ...CURRENT, city: "Torino" },
        ade: { ...ADE, ...override },
        utenzaPiva: UTENZA,
      });

      expect(result?.kind).toBe("non-applicabile");
      expect(result?.patch).toBeNull();
    },
  );
});

describe("getAdeIdentityMismatches", () => {
  const ROW = {
    businessName: "Mario Rossi",
    adeDenominazione: "ACME SRL",
    address: "Via Casa",
    streetNumber: "1",
    zipCode: "00100",
    city: "Roma",
    province: "RM",
    adeIndirizzo: "Via Roma",
    adeNumeroCivico: "10",
    adeCap: "20100",
    adeComune: "Milano",
    adeProvincia: "MI",
  };
  const UTENZA = "11111111111";

  it("restituisce entrambi i verdetti quando divergono entrambi", () => {
    const result = getAdeIdentityMismatches(ROW, UTENZA);

    expect(result.denominazione?.kind).toBe("divergente");
    expect(result.sedeLegale?.kind).toBe("divergente");
  });

  // I due sono indipendenti: allineare il nome non allinea l'indirizzo.
  it("tiene i due verdetti separati", () => {
    const result = getAdeIdentityMismatches(
      { ...ROW, businessName: "ACME SRL" },
      UTENZA,
    );

    expect(result.denominazione).toBeNull();
    expect(result.sedeLegale?.kind).toBe("divergente");
  });

  // Nessun chiamante deve mettere un guard sul business: ci pensano i predicati.
  it("tollera l'assenza della riga senza lanciare", () => {
    for (const row of [null, undefined]) {
      expect(getAdeIdentityMismatches(row, UTENZA)).toEqual({
        denominazione: null,
        sedeLegale: null,
      });
    }
  });

  it("tace su un'utenza 'me stesso'", () => {
    expect(getAdeIdentityMismatches(ROW, null)).toEqual({
      denominazione: null,
      sedeLegale: null,
    });
  });
});
