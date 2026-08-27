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

import { sqlTextOf } from "../../tests/_helpers/sql-text";
import {
  getAdminPaidUsers,
  getAdminRecentProfiles,
  getAdminTopMerchants,
  getAdminTrialExpiring,
} from "./admin-directory";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminTopMerchants", () => {
  it("converte in numeri i contatori e gli importi restituiti come stringhe", async () => {
    mockExecute.mockResolvedValueOnce([
      { by_receipts: [MERCHANT], by_revenue: [MERCHANT] },
    ]);

    const result = await getAdminTopMerchants("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.merchants.byReceipts[0]).toEqual({
      businessId: "b1",
      businessName: "Bar Centrale",
      ownerName: "Mario Rossi",
      location: "Milano (MI)",
      email: "mario@example.com",
      receipts: 12,
      revenueCents: 45000,
    });
  });

  it("espone le due classifiche separatamente", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        by_receipts: [MERCHANT],
        by_revenue: [{ ...MERCHANT, business_id: "b2", receipts: "3" }],
      },
    ]);

    const result = await getAdminTopMerchants("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.merchants.byReceipts[0].businessId).toBe("b1");
    expect(result.merchants.byRevenue[0].businessId).toBe("b2");
  });

  it("degrada a liste vuote se una colonna json arriva illeggibile", async () => {
    mockExecute.mockResolvedValueOnce([
      { by_receipts: "{non-json", by_revenue: null },
    ]);

    const result = await getAdminTopMerchants("30d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.merchants.byReceipts).toEqual([]);
    expect(result.merchants.byRevenue).toEqual([]);
  });

  it("degrada a { error } se il DB fallisce, senza propagare (regola 19)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await getAdminTopMerchants("30d", REFERENCE);

    expect(result).toEqual({
      error:
        "Impossibile caricare le classifiche esercenti. Riprova tra qualche istante.",
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_directory_load" }),
      expect.any(String),
    );
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminTopMerchants("30d", REFERENCE);

    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it("esegue una sola query, con il budget di durata", async () => {
    mockExecute.mockResolvedValueOnce([{ by_receipts: [], by_revenue: [] }]);

    await getAdminTopMerchants("30d", REFERENCE);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      10_000,
      expect.any(Function),
    );
  });
});

describe("getAdminRecentProfiles", () => {
  it("mappa i profili conservando la data di registrazione", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        rows: [
          {
            name: "Anna Bianchi",
            email: "anna@example.com",
            created_at: "2026-08-20T09:00:00.000Z",
          },
        ],
      },
    ]);

    const result = await getAdminRecentProfiles("30d", REFERENCE);

    expect(result).toEqual({
      rows: [
        {
          name: "Anna Bianchi",
          email: "anna@example.com",
          createdAt: "2026-08-20T09:00:00.000Z",
        },
      ],
    });
  });

  it("degrada a lista vuota se il json arriva illeggibile", async () => {
    mockExecute.mockResolvedValueOnce([{ rows: "{non-json" }]);

    const result = await getAdminRecentProfiles("30d", REFERENCE);

    expect(result).toEqual({ rows: [] });
  });

  it("degrada a { error } se il DB fallisce", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const result = await getAdminRecentProfiles("30d", REFERENCE);

    expect(result).toEqual({
      error:
        "Impossibile caricare i registrati di recente. Riprova tra qualche istante.",
    });
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminRecentProfiles("30d", REFERENCE);

    expect(result).toMatchObject({ error: expect.any(String) });
  });
});

describe("getAdminTrialExpiring", () => {
  it("mappa i trial con la data derivata dal DB", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        rows: [
          {
            name: null,
            email: "tri@example.com",
            trial_expires_at: "2026-08-28T00:00:00.000Z",
          },
        ],
      },
    ]);

    const result = await getAdminTrialExpiring();

    // Nome null va tenuto: la riga serve comunque, identificata dall'email.
    expect(result).toEqual({
      rows: [
        {
          name: null,
          email: "tri@example.com",
          trialExpiresAt: "2026-08-28T00:00:00.000Z",
        },
      ],
    });
  });

  it("non filtra per periodo: la finestra è ancorata ad adesso", async () => {
    // La ragione per cui questa lettura non prende più un `range`: lo riceveva
    // e lo ignorava. Se un domani la query iniziasse a legarne gli estremi,
    // "chi devo richiamare questa settimana" cambierebbe risposta a seconda
    // del periodo selezionato nelle card.
    mockExecute.mockResolvedValueOnce([{ rows: [] }]);

    await getAdminTrialExpiring();

    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("now()");
    expect(queried).not.toContain("timestamptz");
  });

  it("degrada a { error } se il DB fallisce", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const result = await getAdminTrialExpiring();

    expect(result).toEqual({
      error:
        "Impossibile caricare i trial in scadenza. Riprova tra qualche istante.",
    });
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminTrialExpiring();

    expect(result).toMatchObject({ error: expect.any(String) });
  });
});

describe("getAdminPaidUsers", () => {
  it("mappa gli utenti paganti, ammettendo una data di attivazione ignota", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        rows: [
          {
            name: "Luca Verdi",
            email: "luca@example.com",
            plan: "pro",
            plan_activated_at: null,
          },
        ],
      },
    ]);

    const result = await getAdminPaidUsers();

    expect(result).toEqual({
      rows: [
        {
          name: "Luca Verdi",
          email: "luca@example.com",
          plan: "pro",
          planActivatedAt: null,
        },
      ],
    });
  });

  it("degrada a { error } se il DB fallisce", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const result = await getAdminPaidUsers();

    expect(result).toEqual({
      error:
        "Impossibile caricare gli utenti paganti. Riprova tra qualche istante.",
    });
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminPaidUsers();

    expect(result).toMatchObject({ error: expect.any(String) });
  });
});

describe("telemetria degli elenchi", () => {
  it("non scrive email né nomi nel log di errore", async () => {
    // Un messaggio Postgres può contenere il valore che ha fatto fallire la
    // query, e qui quei valori sono dati personali.
    mockExecute.mockRejectedValueOnce(new Error("boom mario@example.com"));

    await getAdminTopMerchants("30d", REFERENCE);

    const logged = JSON.stringify(mockLoggerWarn.mock.calls[0][0]);
    expect(logged).not.toContain("mario@example.com");
  });

  it("dice quale elenco è caduto, non solo che qualcosa è caduto", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    await getAdminPaidUsers();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "admin_directory_load",
        list: "paid",
      }),
      expect.any(String),
    );
  });

  it("dà a ciascun elenco un messaggio d'errore distinto", async () => {
    const messaggi = new Set<string>();
    for (const read of [
      () => getAdminTopMerchants("30d", REFERENCE),
      () => getAdminRecentProfiles("30d", REFERENCE),
      getAdminTrialExpiring,
      getAdminPaidUsers,
    ]) {
      mockExecute.mockRejectedValueOnce(new Error("boom"));
      const result = await read();
      if (!("error" in result)) throw new Error("atteso errore");
      messaggi.add(result.error);
    }

    expect(messaggi.size).toBe(4);
  });
});
