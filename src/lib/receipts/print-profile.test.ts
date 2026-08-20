import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLimit = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: mockLimit }),
        }),
      }),
    }),
  }),
}));

import { fetchReceiptPrintProfile } from "./print-profile";

const HEADER = {
  businessName: "Bar da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
};

/** Riga della join businesses × profiles: header + nota + campi di piano. */
const ROW = {
  ...HEADER,
  receiptFooterNote: null as string | null,
  plan: "pro",
  trialStartedAt: null as Date | null,
  planExpiresAt: null as Date | null,
  referralBonusDays: 0,
};

beforeEach(() => {
  mockLimit.mockReset();
});

describe("fetchReceiptPrintProfile", () => {
  it("ritorna i campi d'intestazione dell'esercente", async () => {
    mockLimit.mockResolvedValue([ROW]);
    await expect(fetchReceiptPrintProfile("biz-1")).resolves.toEqual({
      header: HEADER,
      footerNote: null,
    });
  });

  it("ritorna null quando il business non esiste", async () => {
    mockLimit.mockResolvedValue([]);
    await expect(fetchReceiptPrintProfile("assente")).resolves.toBeNull();
  });

  it("accetta i campi indirizzo nulli: sono opzionali in onboarding", async () => {
    mockLimit.mockResolvedValue([
      { ...ROW, address: null, city: null, province: null, zipCode: null },
    ]);
    await expect(fetchReceiptPrintProfile("biz-2")).resolves.toEqual({
      header: {
        ...HEADER,
        address: null,
        city: null,
        province: null,
        zipCode: null,
      },
      footerNote: null,
    });
  });

  it("rifiuta l'header senza ragione sociale invece di stamparne uno mutilo", async () => {
    // Meglio nessuna stampa termica (il bottone ripiega sul PDF) che un
    // documento fiscale senza intestazione.
    mockLimit.mockResolvedValue([{ ...ROW, businessName: null }]);
    await expect(fetchReceiptPrintProfile("biz-3")).resolves.toBeNull();
  });

  it("rifiuta l'header senza partita IVA", async () => {
    mockLimit.mockResolvedValue([{ ...ROW, vatNumber: null }]);
    await expect(fetchReceiptPrintProfile("biz-4")).resolves.toBeNull();
  });

  it("restituisce il messaggio di cortesia di un esercente Pro", async () => {
    mockLimit.mockResolvedValue([
      { ...ROW, receiptFooterNote: "Arrivederci e grazie!" },
    ]);
    const profile = await fetchReceiptPrintProfile("biz-5");
    expect(profile?.footerNote).toBe("Arrivederci e grazie!");
  });

  // Downgrade: la nota resta in tabella ma non si stampa più.
  it("nasconde il messaggio a un piano senza accesso Pro", async () => {
    mockLimit.mockResolvedValue([
      { ...ROW, receiptFooterNote: "Arrivederci e grazie!", plan: "starter" },
    ]);
    const profile = await fetchReceiptPrintProfile("biz-6");
    expect(profile?.footerNote).toBeNull();
    expect(profile?.header).toEqual(HEADER);
  });
});
