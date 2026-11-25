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

// Il gate di richiesta (`requireAdmin`) ha i suoi test in `admin-guard.test.ts`
// e in `admin-sql.test.ts`: qui interessano le query.
vi.mock("./admin-guard", () => ({
  requireAdmin: async () => ({ id: "u-admin" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: vi.fn(), info: vi.fn() },
}));

import { sqlTextOf } from "../../tests/_helpers/sql-text";
import {
  getAdminPaidUsers,
  getAdminSignups,
  getAdminStalePendingDocuments,
  getAdminTopMerchants,
  getAdminTrialActive,
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
      () => getAdminSignups("30d", REFERENCE),
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

describe("getAdminSignups", () => {
  const SIGNUP_ROW = {
    name: "Mario Rossi",
    email: "fermo@example.com",
    registered_at: "2026-08-20T08:00:00.000Z",
    status: "stalled",
    outcome: "auth_error",
    attempts: "3",
    stalled_since: "2026-08-21T08:00:00.000Z",
  };

  function signupsRow(over: Record<string, unknown> = {}) {
    return {
      total: "5",
      recent: "2",
      weeks: "3",
      in_range_rows: [SIGNUP_ROW],
      earlier_rows: [],
      ...over,
    };
  }

  it("mappa righe e conteggi, convertendo i bigint che arrivano come stringhe", async () => {
    mockExecute.mockResolvedValueOnce([signupsRow()]);

    const result = await getAdminSignups("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.signups.counts).toEqual({ total: 5, recent: 2, weeks: 3 });
    expect(result.signups.inRange).toEqual([
      {
        name: "Mario Rossi",
        email: "fermo@example.com",
        registeredAt: "2026-08-20T08:00:00.000Z",
        status: "stalled",
        outcome: "auth_error",
        attempts: 3,
        stalledSince: "2026-08-21T08:00:00.000Z",
      },
    ]);
    expect(result.signups.earlier).toEqual([]);
  });

  it("tiene separate le due metà: periodo e fermi registrati prima", async () => {
    mockExecute.mockResolvedValueOnce([
      signupsRow({
        in_range_rows: [{ ...SIGNUP_ROW, email: "nuovo@example.com" }],
        earlier_rows: [{ ...SIGNUP_ROW, email: "vecchio@example.com" }],
      }),
    ]);

    const result = await getAdminSignups("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.signups.inRange.map((r) => r.email)).toEqual([
      "nuovo@example.com",
    ]);
    expect(result.signups.earlier.map((r) => r.email)).toEqual([
      "vecchio@example.com",
    ]);
  });

  it("«mai tentato» resta null e non diventa una stringa vuota", async () => {
    mockExecute.mockResolvedValueOnce([
      signupsRow({
        in_range_rows: [{ ...SIGNUP_ROW, outcome: null, attempts: "0" }],
      }),
    ]);

    const result = await getAdminSignups("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    // Chi ha salvato le credenziali e non ha mai premuto Verifica non è chi
    // ha sbagliato password (PR #957): collassare il null su "" li
    // renderebbe indistinguibili.
    expect(result.signups.inRange[0].outcome).toBeNull();
    expect(result.signups.inRange[0].attempts).toBe(0);
  });

  it("riconosce i tre stati e ricade su «none» per un valore ignoto", async () => {
    mockExecute.mockResolvedValueOnce([
      signupsRow({
        in_range_rows: [
          { ...SIGNUP_ROW, email: "a@x.it", status: "ok" },
          { ...SIGNUP_ROW, email: "b@x.it", status: "none" },
          { ...SIGNUP_ROW, email: "c@x.it", status: "boh" },
        ],
      }),
    ]);

    const result = await getAdminSignups("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.signups.inRange.map((r) => r.status)).toEqual([
      "ok",
      "none",
      "none",
    ]);
  });

  it("definisce «fermo» come prima, più il taglio a 30 giorni", async () => {
    mockExecute.mockResolvedValueOnce([signupsRow()]);

    await getAdminSignups("7d", REFERENCE);

    // Credenziali mai verificate E identità fiscale mai scritta, con trial
    // attivo (issue #984, PR #957); oltre i 30 giorni non interessa più.
    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("c.id IS NOT NULL");
    expect(queried).toContain("c.verified_at IS NULL");
    expect(queried).toContain("b.fiscal_code IS NULL");
    expect(queried).toContain("trial_started_at IS NOT NULL");
    expect(queried).toContain("make_interval(days => ");
  });

  it("prende il periodo per i registrati e now() per i fermi", async () => {
    mockExecute.mockResolvedValueOnce([signupsRow()]);

    await getAdminSignups("7d", REFERENCE);

    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("timestamptz");
    expect(queried).toContain("now()");
  });

  it("dà a ciascuna metà il proprio limite di righe", async () => {
    mockExecute.mockResolvedValueOnce([signupsRow()]);

    await getAdminSignups("7d", REFERENCE);

    // Con un limite comune, un periodo lungo riempirebbe la tabella di
    // registrati e spingerebbe fuori proprio i fermi da recuperare.
    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried.match(/LIMIT/g)).toHaveLength(2);
  });

  it("degrada a lista vuota se il json delle righe arriva illeggibile", async () => {
    mockExecute.mockResolvedValueOnce([
      signupsRow({ in_range_rows: "{non-json", earlier_rows: null }),
    ]);

    const result = await getAdminSignups("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.signups.inRange).toEqual([]);
    expect(result.signups.earlier).toEqual([]);
  });

  it("degrada a { error } se la query fallisce, senza passare l'errore al logger", async () => {
    mockExecute.mockRejectedValueOnce(new Error("timeout fermo@example.com"));

    const result = await getAdminSignups("7d", REFERENCE);

    expect(result).toEqual({
      error: "Impossibile caricare i registrati. Riprova tra qualche istante.",
    });
    // Nessun `err` nel payload: un messaggio Postgres può contenere l'email
    // che ha fatto fallire la query.
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      { errorClass: "admin_directory_load", list: "signups", range: "7d" },
      "admin directory: query fallita",
    );
  });

  it("degrada a { error } anche quando la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminSignups("7d", REFERENCE);

    expect("error" in result).toBe(true);
  });
});

describe("getAdminStalePendingDocuments", () => {
  const REFERENCE = new Date("2026-09-17T10:00:00Z");

  it("mappa esercente, data e importo, convertendo i centesimi da stringa", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        rows: [
          {
            business_name: "Bar Centrale",
            created_at: "2026-09-17T08:00:00.000Z",
            amount_cents: "1250",
          },
        ],
      },
    ]);

    const result = await getAdminStalePendingDocuments(REFERENCE);

    expect(result).toEqual({
      rows: [
        {
          businessName: "Bar Centrale",
          createdAt: "2026-09-17T08:00:00.000Z",
          amountCents: 1250,
        },
      ],
    });
  });

  it("guarda solo le vendite PENDING, mai gli annulli", async () => {
    mockExecute.mockResolvedValueOnce([{ rows: [] }]);

    await getAdminStalePendingDocuments(REFERENCE);

    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("'SALE'");
    expect(queried).toContain("'PENDING'");
  });

  it("degrada a { error } se il DB fallisce", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const result = await getAdminStalePendingDocuments(REFERENCE);

    expect(result).toEqual({
      error:
        "Impossibile caricare i documenti in sospeso. Riprova tra qualche istante.",
    });
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminStalePendingDocuments(REFERENCE);

    expect("error" in result).toBe(true);
  });
});

describe("getAdminTrialActive", () => {
  it("restituisce conteggi ed elenco dalla stessa lettura, convertiti in numeri", async () => {
    mockExecute.mockResolvedValueOnce([
      { active: "24", with_receipts: "9", rows: [MERCHANT] },
    ]);

    const result = await getAdminTrialActive();

    if ("error" in result) throw new Error("atteso successo");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.trials.active).toBe(24);
    expect(result.trials.withReceipts).toBe(9);
    expect(result.trials.merchants[0]).toEqual({
      businessId: "b1",
      businessName: "Bar Centrale",
      ownerName: "Mario Rossi",
      location: "Milano (MI)",
      email: "mario@example.com",
      receipts: 12,
      revenueCents: 45000,
    });
  });

  it("isola prima i trial attivi, poi legge i loro scontrini per business", async () => {
    // L'inversione che rende la query economica: sommare lo storico di tutti
    // gli esercenti e filtrare i trial alla fine era la versione lenta.
    mockExecute.mockResolvedValueOnce([
      { active: "0", with_receipts: "0", rows: [] },
    ]);

    await getAdminTrialActive();

    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("WITH trial AS");
    expect(queried).toContain("FROM trial t");
    expect(queried).toContain("cd.business_id = t.business_id");
    expect(queried).not.toContain("timestamptz");
  });

  it("tratta come 0 conteggi null e come lista vuota righe mancanti", async () => {
    mockExecute.mockResolvedValueOnce([
      { active: null, with_receipts: null, rows: null },
    ]);

    const result = await getAdminTrialActive();

    expect(result).toEqual({
      trials: { active: 0, withReceipts: 0, merchants: [] },
    });
  });

  it("degrada a { error } se il DB fallisce", async () => {
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    const result = await getAdminTrialActive();

    expect(result).toEqual({
      error:
        "Impossibile caricare i trial attivi. Riprova tra qualche istante.",
    });
  });

  it("degrada a { error } se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminTrialActive();

    expect("error" in result).toBe(true);
  });
});
