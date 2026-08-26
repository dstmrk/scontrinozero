// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockLoggerWarn, mockWithStatementTimeout } = vi.hoisted(
  () => ({
    mockExecute: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockWithStatementTimeout: vi.fn(),
  }),
);

vi.mock("@/lib/db-timeout", () => ({
  withStatementTimeout: async (
    timeoutMs: number,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    mockWithStatementTimeout(timeoutMs, fn);
    return fn({ execute: mockExecute });
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

import { getAdminDirectory } from "./admin-directory";

const REFERENCE = new Date("2026-08-26T10:00:00Z");

const MERCHANT = {
  business_id: "b1",
  business_name: "Bar Centrale",
  owner_name: "Mario Rossi",
  location: "Milano (MI)",
  email: "mario@example.com",
  receipts: "12",
  revenue_cents: "45000",
};

/** Ordine delle query in `getAdminDirectory`. */
function mockQueries(over: Partial<Record<string, unknown>> = {}) {
  const rows = {
    merchants: {
      by_receipts: [MERCHANT],
      by_revenue: [MERCHANT],
    },
    profiles: { rows: [] },
    trials: { rows: [] },
    paid: { rows: [] },
    ...over,
  };
  mockExecute
    .mockResolvedValueOnce([rows.merchants])
    .mockResolvedValueOnce([rows.profiles])
    .mockResolvedValueOnce([rows.trials])
    .mockResolvedValueOnce([rows.paid]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminDirectory", () => {
  it("converte in numeri i contatori e gli importi restituiti come stringhe", async () => {
    mockQueries();

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.directory.topByReceipts[0]).toEqual({
      businessId: "b1",
      businessName: "Bar Centrale",
      ownerName: "Mario Rossi",
      location: "Milano (MI)",
      email: "mario@example.com",
      receipts: 12,
      revenueCents: 45000,
    });
  });

  it("espone le due classifiche esercenti separatamente", async () => {
    mockQueries({
      merchants: {
        by_receipts: [MERCHANT],
        by_revenue: [{ ...MERCHANT, business_id: "b2", receipts: "3" }],
      },
    });

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.directory.topByReceipts[0].businessId).toBe("b1");
    expect(result.directory.topByRevenue[0].businessId).toBe("b2");
  });

  it("mappa i profili recenti conservando la data di registrazione", async () => {
    mockQueries({
      profiles: {
        rows: [
          {
            name: "Anna Bianchi",
            email: "anna@example.com",
            created_at: "2026-08-20T09:00:00.000Z",
          },
        ],
      },
    });

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.directory.recentProfiles).toEqual([
      {
        name: "Anna Bianchi",
        email: "anna@example.com",
        createdAt: "2026-08-20T09:00:00.000Z",
      },
    ]);
  });

  it("mappa i trial in scadenza con la data derivata dal DB", async () => {
    mockQueries({
      trials: {
        rows: [
          {
            name: null,
            email: "tri@example.com",
            trial_expires_at: "2026-08-28T00:00:00.000Z",
          },
        ],
      },
    });

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    // Nome null va tenuto: la riga serve comunque, identificata dall'email.
    expect(result.directory.trialExpiring).toEqual([
      {
        name: null,
        email: "tri@example.com",
        trialExpiresAt: "2026-08-28T00:00:00.000Z",
      },
    ]);
  });

  it("mappa gli utenti paganti, ammettendo una data di attivazione ignota", async () => {
    mockQueries({
      paid: {
        rows: [
          {
            name: "Luca Verdi",
            email: "luca@example.com",
            plan: "pro",
            plan_activated_at: null,
          },
        ],
      },
    });

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.directory.paidUsers).toEqual([
      {
        name: "Luca Verdi",
        email: "luca@example.com",
        plan: "pro",
        planActivatedAt: null,
      },
    ]);
  });

  it("degrada a liste vuote se una colonna json arriva illeggibile", async () => {
    mockQueries({
      merchants: { by_receipts: "{non-json", by_revenue: null },
      profiles: { rows: "{non-json" },
    });

    const result = await getAdminDirectory("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.directory.topByReceipts).toEqual([]);
    expect(result.directory.topByRevenue).toEqual([]);
    expect(result.directory.recentProfiles).toEqual([]);
  });

  it("degrada a { error } se il DB fallisce, senza propagare (regola 19)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await getAdminDirectory("30d", REFERENCE);

    expect(result).toEqual({
      error: "Impossibile caricare gli elenchi. Riprova tra qualche istante.",
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_directory_load" }),
      expect.any(String),
    );
  });

  it("non scrive email né nomi nel log di errore", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom mario@example.com"));

    await getAdminDirectory("30d", REFERENCE);

    const logged = JSON.stringify(mockLoggerWarn.mock.calls[0][0]);
    expect(logged).not.toContain("mario@example.com");
  });

  it("degrada a { error } se una query non restituisce righe", async () => {
    mockExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }])
      .mockResolvedValueOnce([{ rows: [] }]);

    const result = await getAdminDirectory("30d", REFERENCE);

    expect(result).toEqual({
      error: "Impossibile caricare gli elenchi. Riprova tra qualche istante.",
    });
  });

  it("impone un budget di durata alle query", async () => {
    mockQueries();

    await getAdminDirectory("30d", REFERENCE);

    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      10_000,
      expect.any(Function),
    );
  });

  it("esegue quattro query, una per elenco", async () => {
    mockQueries();

    await getAdminDirectory("30d", REFERENCE);

    expect(mockExecute).toHaveBeenCalledTimes(4);
  });
});
