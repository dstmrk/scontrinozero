/**
 * Property test del canone monetario (regola 17, skill `money-rounding`).
 *
 * Gli esempi in `receipt-totals.test.ts` fissano gli oracoli HAR; qui si
 * enunciano le invarianti che devono reggere su QUALUNQUE scontrino che lo
 * schema accetta, e fast-check genera gli input per smentirle. Il valore sta
 * nei casi che nessuno scriverebbe a mano: quantità a tre decimali per prezzi
 * a sei cifre, sconti pari al lordo, cento righe con aliquote miste.
 *
 * Il seed è casuale a ogni run: le proprietà sono vere per costruzione, quindi
 * un rosso è un bug riproducibile, non un flake. fast-check stampa seed e
 * controesempio minimo: per riprodurlo si passa `{ seed, path }` a
 * `fc.assert`.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calcDocTotal,
  calcInputLinesTotalCents,
  calcLineTotalCents,
  computeReceiptTotals,
  type ReceiptLineAmounts,
} from "@/lib/receipts/receipt-totals";

/** Gli stessi codici di `saleLineSchema.vatCode`. */
const VAT_CODES = [
  "4",
  "5",
  "10",
  "22",
  "N1",
  "N2",
  "N3",
  "N4",
  "N5",
  "N6",
] as const;

/** Riga generata in unità intere, così il valore esatto resta noto al test. */
interface GenLine {
  readonly priceCents: number;
  readonly qtyMillis: number;
  readonly discountCents: number;
  readonly vatCode: (typeof VAT_CODES)[number];
}

/** Lordo di riga come lo calcola il refine Zod che lo sconto deve rispettare. */
function grossCentsOf(priceCents: number, qtyMillis: number): number {
  return Math.round((priceCents / 100) * (qtyMillis / 1000) * 100);
}

/**
 * Riga che `saleLineSchema` + `refineSaleLineDiscounts` accettano: prezzo
 * `numeric(10,2)` fino a 999.999,99, quantità `numeric(10,3)` in (0, 9999],
 * sconto in centesimi da 0 al lordo di riga compreso.
 */
const validLine: fc.Arbitrary<GenLine> = fc
  .record({
    priceCents: fc.integer({ min: 0, max: 99_999_999 }),
    qtyMillis: fc.integer({ min: 1, max: 9_999_000 }),
    vatCode: fc.constantFrom(...VAT_CODES),
    discountShare: fc.double({ min: 0, max: 1, noNaN: true }),
    hasDiscount: fc.boolean(),
  })
  .map(({ priceCents, qtyMillis, vatCode, discountShare, hasDiscount }) => {
    const gross = grossCentsOf(priceCents, qtyMillis);
    return {
      priceCents,
      qtyMillis,
      vatCode,
      discountCents: hasDiscount ? Math.round(gross * discountShare) : 0,
    };
  });

/**
 * Riga come può trovarsi in DB: lo sconto può superare il lordo (import o fix
 * manuale), che lo schema avrebbe rifiutato in ingresso.
 */
const storedLine: fc.Arbitrary<GenLine> = fc
  .tuple(validLine, fc.integer({ min: 0, max: 100_000 }))
  .map(([l, excess]) => ({
    ...l,
    discountCents: grossCentsOf(l.priceCents, l.qtyMillis) + excess,
  }));

const lines = fc.array(validLine, { minLength: 1, maxLength: 100 });

/** Forma DB: stringhe come le restituisce Postgres da `numeric`. */
function toDb(l: GenLine): ReceiptLineAmounts {
  return {
    grossUnitPrice: (l.priceCents / 100).toFixed(2),
    quantity: (l.qtyMillis / 1000).toFixed(3),
    lineDiscount: (l.discountCents / 100).toFixed(2),
    vatCode: l.vatCode,
  };
}

/** Forma di input della cassa e di `/api/v1`, dopo il parse Zod. */
function toInput(l: GenLine) {
  return {
    grossUnitPrice: l.priceCents / 100,
    quantity: l.qtyMillis / 1000,
    lineDiscount: l.discountCents / 100,
  };
}

/** Euro → centesimi: esatto, perché ogni valore nasce come `cents / 100`. */
const cents = (euro: number) => Math.round(euro * 100);

describe("receipt-totals — proprietà del canone per riga", () => {
  it("le quattro funzioni pubbliche danno lo stesso totale al centesimo", () => {
    // Regressione: una superficie (AdE, PDF, storico, export riga) che
    // dimentica lo sconto o torna ad arrotondare per documento.
    fc.assert(
      fc.property(lines, (ls) => {
        const db = ls.map(toDb);
        const sent = calcInputLinesTotalCents(ls.map(toInput));

        expect(cents(computeReceiptTotals(db).grandTotal)).toBe(sent);
        expect(cents(calcDocTotal(db))).toBe(sent);
        expect(db.reduce((s, l) => s + calcLineTotalCents(l), 0)).toBe(sent);
      }),
    );
  });

  it("unire due scontrini somma i totali e l'IVA, codice per codice", () => {
    // È la forma osservabile del canone: un arrotondamento per documento
    // (PR #605) rompe l'additività di un centesimo sulle quantità frazionarie.
    fc.assert(
      fc.property(lines, lines, (a, b) => {
        const ta = computeReceiptTotals(a.map(toDb));
        const tb = computeReceiptTotals(b.map(toDb));
        const tab = computeReceiptTotals([...a, ...b].map(toDb));

        expect(cents(tab.grandTotal)).toBe(
          cents(ta.grandTotal) + cents(tb.grandTotal),
        );
        expect(cents(tab.vatTotal)).toBe(
          cents(ta.vatTotal) + cents(tb.vatTotal),
        );
        for (const code of VAT_CODES) {
          expect(cents(tab.vatByCode.get(code) ?? 0)).toBe(
            cents(ta.vatByCode.get(code) ?? 0) +
              cents(tb.vatByCode.get(code) ?? 0),
          );
        }
      }),
    );
  });

  it("ogni riga stampata quadra: lordo − sconto = totale, mai negativo", () => {
    // Regressione: sconto applicato per unità invece che alla riga (HAR.md
    // voce #12), o stampato il valore dichiarato invece di quello applicato
    // quando in DB supera il lordo.
    fc.assert(
      fc.property(fc.array(fc.oneof(validLine, storedLine)), (ls) => {
        const totals = computeReceiptTotals(ls.map(toDb));

        totals.perLine.forEach((calc, i) => {
          const gross = grossCentsOf(ls[i].priceCents, ls[i].qtyMillis);
          expect(cents(calc.lineGross)).toBe(gross);
          expect(cents(calc.discount)).toBe(
            Math.min(ls[i].discountCents, gross),
          );
          expect(cents(calc.lineGross) - cents(calc.discount)).toBe(
            cents(calc.lineTotal),
          );
          expect(calc.lineTotal).toBeGreaterThanOrEqual(0);
        });
        expect(cents(totals.grandTotal)).toBe(
          totals.perLine.reduce((s, c) => s + cents(c.lineTotal), 0),
        );
      }),
    );
  });

  it("l'IVA è lo scorporo del totale scontato, entro mezzo centesimo", () => {
    // Oracolo indipendente dalla formula di produzione: IVA esatta di un
    // lordo T all'aliquota r è T·r/(100+r). Regressione: IVA sul prezzo di
    // listino invece che sul totale scontato (HAR.md voce #3a), o calcolata
    // come r% del lordo invece che scorporata.
    fc.assert(
      fc.property(validLine, (l) => {
        const totals = computeReceiptTotals([toDb(l)]);
        const total = cents(totals.grandTotal);
        const rate = Number.parseFloat(l.vatCode);

        if (Number.isNaN(rate)) {
          expect(totals.vatByCode.size).toBe(0);
          expect(totals.vatTotal).toBe(0);
          return;
        }
        const exactVat = (total * rate) / (100 + rate);
        expect(Math.abs(cents(totals.vatTotal) - exactVat)).toBeLessThanOrEqual(
          0.5 + 1e-9,
        );
      }),
    );
  });

  it("l'IVA complessiva è la somma per codice e non supera il totale", () => {
    // Regressione: `vatTotal` ricavato dagli euro già arrotondati di
    // `vatByCode` (drift float), o una natura N* che finisce fra le aliquote.
    fc.assert(
      fc.property(lines, (ls) => {
        const totals = computeReceiptTotals(ls.map(toDb));
        const byCode = [...totals.vatByCode.entries()];

        expect(cents(totals.vatTotal)).toBe(
          byCode.reduce((s, [, v]) => s + cents(v), 0),
        );
        expect(totals.vatTotal).toBeGreaterThanOrEqual(0);
        expect(totals.vatTotal).toBeLessThanOrEqual(totals.grandTotal);
        for (const [code, v] of byCode) {
          expect(code.startsWith("N")).toBe(false);
          expect(v).toBeGreaterThan(0);
        }
      }),
    );
  });
});
