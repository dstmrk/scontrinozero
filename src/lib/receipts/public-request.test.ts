import { describe, it, expect } from "vitest";
import {
  parsePublicRequest,
  readRawPaymentMethod,
  resolvePaymentRows,
} from "@/lib/receipts/public-request";

describe("parsePublicRequest", () => {
  it("legge metodo di pagamento, codice lotteria e sconto a pagare", () => {
    expect(
      parsePublicRequest({
        paymentMethod: "PE",
        lotteryCode: "ABCD1234",
        globalDiscount: 0.4,
      }),
    ).toEqual({
      paymentMethod: "PE",
      payments: null,
      lotteryCode: "ABCD1234",
      globalDiscountCents: 40,
    });
  });

  it("degrada a PC / nessuna lotteria / nessuno sconto sui documenti storici", () => {
    // Righe scritte prima che i campi esistessero: `publicRequest` è NULL o
    // contiene solo `paymentMethod`. Nessuna migrazione le tocca (jsonb).
    expect(parsePublicRequest(null)).toEqual({
      paymentMethod: "PC",
      payments: null,
      lotteryCode: null,
      globalDiscountCents: 0,
    });
    expect(parsePublicRequest({ paymentMethod: "PC" })).toEqual({
      paymentMethod: "PC",
      payments: null,
      lotteryCode: null,
      globalDiscountCents: 0,
    });
  });

  it("tratta un paymentMethod non riconosciuto come PC", () => {
    // Difesa: la colonna è jsonb non tipizzato, non un enum DB.
    expect(parsePublicRequest({ paymentMethod: "TR" }).paymentMethod).toBe(
      "PC",
    );
    expect(parsePublicRequest("stringa").paymentMethod).toBe("PC");
  });

  it("ignora un lotteryCode vuoto o non stringa", () => {
    expect(parsePublicRequest({ lotteryCode: "" }).lotteryCode).toBeNull();
    expect(parsePublicRequest({ lotteryCode: 42 }).lotteryCode).toBeNull();
  });

  it("restituisce lo sconto in centesimi interi, mai in float (regola 17)", () => {
    // 0.1 + 0.2 !== 0.3 in float: l'abbuono deve arrivare alle superfici di
    // lettura già in cents, così sottrarlo dal totale non introduce drift.
    expect(
      parsePublicRequest({ globalDiscount: 0.3 }).globalDiscountCents,
    ).toBe(30);
    expect(
      parsePublicRequest({ globalDiscount: 12.34 }).globalDiscountCents,
    ).toBe(1234);
  });

  it("scarta uno sconto non numerico, negativo o non finito", () => {
    expect(
      parsePublicRequest({ globalDiscount: "0.40" }).globalDiscountCents,
    ).toBe(0);
    expect(parsePublicRequest({ globalDiscount: -1 }).globalDiscountCents).toBe(
      0,
    );
    expect(
      parsePublicRequest({ globalDiscount: Number.NaN }).globalDiscountCents,
    ).toBe(0);
    expect(
      parsePublicRequest({ globalDiscount: Number.POSITIVE_INFINITY })
        .globalDiscountCents,
    ).toBe(0);
  });
});

describe("parsePublicRequest — payments (pagamento misto)", () => {
  it("legge l'array payments convertendo gli importi in centesimi interi", () => {
    // Caso di riferimento HAR.md voce #1: contante 0,50 + elettronico 1,00.
    expect(
      parsePublicRequest({
        payments: [
          { type: "PC", amount: 0.5 },
          { type: "PE", amount: 1.0 },
        ],
      }).payments,
    ).toEqual([
      { type: "PC", amountCents: 50 },
      { type: "PE", amountCents: 100 },
    ]);
  });

  it("ritorna payments null sui documenti a metodo singolo e storici", () => {
    // `null` non significa "nessun pagamento": significa "il documento non
    // porta una ripartizione, l'incassato sta tutto sul metodo scalare".
    expect(parsePublicRequest({ paymentMethod: "PE" }).payments).toBeNull();
    expect(parsePublicRequest(null).payments).toBeNull();
  });

  it("scarta le voci a importo zero: non sono un dato, sono uno slot vuoto", () => {
    // L'AdE manda sempre tutti e sei gli slot anche a zero (HAR.md voce #6);
    // noi scriviamo solo cio' che intendiamo, ma un lettore non deve dipendere
    // da quella disciplina. Le superfici di stampa omettono comunque le voci a
    // zero (voce #17c): filtrarle qui evita che ognuna lo rifaccia.
    expect(
      parsePublicRequest({
        payments: [
          { type: "PC", amount: 0 },
          { type: "PE", amount: 2.5 },
        ],
      }).payments,
    ).toEqual([{ type: "PE", amountCents: 250 }]);
  });

  it("degrada allo scalare quando ANCHE UNA SOLA voce e' malformata", () => {
    // Tutto-o-niente, non filtraggio: scartare una voce di un misto e tenere
    // l'altra mostrerebbe un documento fiscale con un incasso dimezzato e
    // nessun segnale che manchi qualcosa. Meglio degradare all'unica lettura
    // che sappiamo coerente — lo scalare — e lasciare che il chiamante
    // ricomponga l'incassato dal totale.
    const malformed = [
      [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: "1.00" },
      ],
      [
        { type: "PC", amount: 0.5 },
        { type: "XX", amount: 1 },
      ],
      [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: -1 },
      ],
      [
        { type: "PC", amount: 0.5 },
        { type: "PE", amount: Number.NaN },
      ],
      [{ type: "PC", amount: 0.5 }, null],
      [{ type: "PC", amount: 0.5 }, { amount: 1 }],
    ];
    for (const payments of malformed) {
      expect(
        parsePublicRequest({ paymentMethod: "PE", payments }).payments,
      ).toBeNull();
    }
  });

  it("ignora un payments che non e' un array, o che e' vuoto", () => {
    expect(parsePublicRequest({ payments: "PC" }).payments).toBeNull();
    expect(parsePublicRequest({ payments: [] }).payments).toBeNull();
    // Un array di soli slot a zero collassa a vuoto, quindi a null.
    expect(
      parsePublicRequest({ payments: [{ type: "PC", amount: 0 }] }).payments,
    ).toBeNull();
  });

  it("non si fa confondere da un paymentMethod incoerente con payments", () => {
    // Il formato persistito porta `paymentMethod` SOLO sui metodi singoli, ma
    // il jsonb non e' tipizzato: se arrivano entrambi, `payments` e' il dato
    // canonico e vince.
    const parsed = parsePublicRequest({
      paymentMethod: "PC",
      payments: [
        { type: "PC", amount: 1 },
        { type: "PE", amount: 2 },
      ],
    });
    expect(parsed.payments).toHaveLength(2);
  });
});

describe("resolvePaymentRows", () => {
  it("ritorna le voci del documento misto, senza toccarle", () => {
    const rows = resolvePaymentRows(
      {
        paymentMethod: "PC",
        payments: [
          { type: "PC", amountCents: 50 },
          { type: "PE", amountCents: 100 },
        ],
      },
      150,
    );
    expect(rows).toEqual([
      { type: "PC", amountCents: 50 },
      { type: "PE", amountCents: 100 },
    ]);
  });

  it("ricompone l'unica voce dall'incassato sui documenti a metodo singolo", () => {
    // E' la degradazione che tiene in vita i documenti storici: `payments`
    // non c'e', ma l'incassato lo sa il chiamante (totale meno abbuono).
    expect(
      resolvePaymentRows({ paymentMethod: "PE", payments: null }, 390),
    ).toEqual([{ type: "PE", amountCents: 390 }]);
  });

  it("non inventa una voce quando l'incassato e' zero", () => {
    // Uno scontrino interamente abbuonato non ha incasso da stampare, e la
    // riga a zero non va stampata (HAR.md voce #17c).
    expect(
      resolvePaymentRows({ paymentMethod: "PC", payments: null }, 0),
    ).toEqual([]);
  });

  it("le voci del misto sommano all'incassato, non al corrispettivo", () => {
    // Invariante HAR.md voce #5: Σ pagamenti + sconto a pagare = totale.
    // Qui il totale e' 1,90 e l'abbuono 0,40, quindi l'incassato e' 1,50.
    const rows = resolvePaymentRows(
      {
        paymentMethod: "PC",
        payments: [
          { type: "PC", amountCents: 50 },
          { type: "PE", amountCents: 100 },
        ],
      },
      150,
    );
    const sum = rows.reduce((acc, r) => acc + r.amountCents, 0);
    expect(sum).toBe(150);
  });
});

describe("parsePublicRequest — ordine canonico delle voci", () => {
  it("normalizza l'ordine su quello del tracciato AdE (PC prima di PE)", () => {
    // Le stesse voci arrivate in ordine inverso devono produrre lo stesso
    // scontrino: senza questo, PDF e termica dello stesso documento si
    // ordinano come capita (HAR.md voce #6).
    expect(
      parsePublicRequest({
        payments: [
          { type: "PE", amount: 1.0 },
          { type: "PC", amount: 0.5 },
        ],
      }).payments,
    ).toEqual([
      { type: "PC", amountCents: 50 },
      { type: "PE", amountCents: 100 },
    ]);
  });
});

describe("readRawPaymentMethod", () => {
  it("restituisce il metodo così com'è registrato", () => {
    expect(readRawPaymentMethod({ paymentMethod: "PE" })).toBe("PE");
  });

  it("restituisce null quando il documento non porta il campo", () => {
    // È la differenza che serve a chi non può degradare a `PC`: il contratto
    // `/api/v1` espone `null`, la cella CSV resta vuota, l'analytics
    // attribuisce a `other`. `parsePublicRequest` invece degrada, perché una
    // copia stampata deve pur riportare una modalità.
    expect(readRawPaymentMethod(null)).toBeNull();
    expect(readRawPaymentMethod({})).toBeNull();
    expect(readRawPaymentMethod("PC")).toBeNull();
    expect(parsePublicRequest(null).paymentMethod).toBe("PC");
  });

  it("non valida il valore: normalizzarlo spetta a chi lo consuma", () => {
    // `/api/v1` non può cambiare forma a un dato già emesso, quindi qui non
    // si filtra nulla.
    expect(readRawPaymentMethod({ paymentMethod: "TR" })).toBe("TR");
    expect(readRawPaymentMethod({ paymentMethod: 42 })).toBeNull();
  });
});
