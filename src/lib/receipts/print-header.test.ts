import { describe, it, expect, beforeEach, vi } from "vitest";

const mockLimit = vi.fn();

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockLimit }),
      }),
    }),
  }),
}));

import { fetchReceiptPrintHeader } from "./print-header";

const ROW = {
  businessName: "Bar da Mario",
  vatNumber: "12345678901",
  address: "Via Roma 1",
  city: "Milano",
  province: "MI",
  zipCode: "20100",
};

beforeEach(() => {
  mockLimit.mockReset();
});

describe("fetchReceiptPrintHeader", () => {
  it("ritorna i campi d'intestazione dell'esercente", async () => {
    mockLimit.mockResolvedValue([ROW]);
    await expect(fetchReceiptPrintHeader("biz-1")).resolves.toEqual(ROW);
  });

  it("ritorna null quando il business non esiste", async () => {
    mockLimit.mockResolvedValue([]);
    await expect(fetchReceiptPrintHeader("assente")).resolves.toBeNull();
  });

  it("accetta i campi indirizzo nulli: sono opzionali in onboarding", async () => {
    const partial = {
      ...ROW,
      address: null,
      city: null,
      province: null,
      zipCode: null,
    };
    mockLimit.mockResolvedValue([partial]);
    await expect(fetchReceiptPrintHeader("biz-2")).resolves.toEqual(partial);
  });

  it("rifiuta l'header senza ragione sociale invece di stamparne uno mutilo", async () => {
    // Meglio nessuna stampa termica (il bottone ripiega sul PDF) che un
    // documento fiscale senza intestazione.
    mockLimit.mockResolvedValue([{ ...ROW, businessName: null }]);
    await expect(fetchReceiptPrintHeader("biz-3")).resolves.toBeNull();
  });

  it("rifiuta l'header senza partita IVA", async () => {
    mockLimit.mockResolvedValue([{ ...ROW, vatNumber: null }]);
    await expect(fetchReceiptPrintHeader("biz-4")).resolves.toBeNull();
  });
});
