// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockLoggerWarn, mockWithStatementTimeout } = vi.hoisted(
  () => ({
    mockExecute: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockWithStatementTimeout: vi.fn(),
  }),
);

// `withStatementTimeout` avvolge le query in una transazione con
// `SET LOCAL statement_timeout`. Nei test è un passthrough che invoca la
// callback con una tx che espone lo stesso mock di execute.
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

import { getAdminKpis } from "./admin-metrics";

/**
 * postgres-js restituisce `count(*)` e `sum(...)::bigint` come **stringhe**
 * (un bigint non entra in un Number JS in sicurezza). I fixture li riproducono
 * come stringhe apposta: era il modo più facile per far comparire "0" al posto
 * dei totali o un `NaN` in pagina.
 */
function usersRow(over: Record<string, unknown> = {}) {
  return {
    users_total: "120",
    users_in_range: "8",
    users_sparkline: [],
    trials_active: "5",
    trial_cohort_started: "20",
    trial_cohort_converted: "5",
    ...over,
  };
}

function docsRow(over: Record<string, unknown> = {}) {
  return {
    receipts_total: "900",
    receipts_in_range: "30",
    revenue_cents_total: "1234567",
    revenue_cents_in_range: "45678",
    voided_in_range: "2",
    daily: [],
    ...over,
  };
}

/** Prima execute = profili, seconda = documenti (ordine di `getAdminKpis`). */
function mockQueries(users = usersRow(), docs = docsRow()) {
  mockExecute.mockResolvedValueOnce([users]).mockResolvedValueOnce([docs]);
}

const REFERENCE = new Date("2026-08-26T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminKpis", () => {
  it("converte in numeri i bigint che il driver restituisce come stringhe", async () => {
    mockQueries();

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: {
        usersTotal: 120,
        usersInRange: 8,
        receiptsTotal: 900,
        receiptsInRange: 30,
        revenueCentsTotal: 1234567,
        revenueCentsInRange: 45678,
        voidedInRange: 2,
        trialsActive: 5,
      },
    });
  });

  it("calcola il tasso di conversione trial come convertiti/partiti", async () => {
    mockQueries(
      usersRow({ trial_cohort_started: "20", trial_cohort_converted: "7" }),
    );

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { trialConversionRate: 0.35 } });
  });

  it("ritorna conversione 0 quando nessun trial è partito nella finestra", async () => {
    mockQueries(
      usersRow({ trial_cohort_started: "0", trial_cohort_converted: "0" }),
    );

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { trialConversionRate: 0 } });
  });

  it("riempie di zeri i giorni senza dati, sull'asse fiscale italiano", async () => {
    mockQueries(
      usersRow({
        users_sparkline: [{ date: "2026-08-25", value: 3 }],
      }),
      docsRow({
        daily: [{ date: "2026-08-24", receipts: 4, cents: 1000 }],
      }),
    );

    const result = await getAdminKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    // 7d = [20 ago 00:00 Rome, 27 ago 00:00 Rome) → 7 punti per ogni serie.
    expect(result.kpis.usersSparkline).toHaveLength(7);
    expect(result.kpis.receiptsSparkline).toHaveLength(7);
    expect(result.kpis.revenueSparkline).toHaveLength(7);
    expect(result.kpis.usersSparkline.at(-1)).toEqual({
      date: "2026-08-26",
      value: 0,
    });
    expect(
      result.kpis.usersSparkline.find((p) => p.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 3 });
    expect(
      result.kpis.receiptsSparkline.find((p) => p.date === "2026-08-24"),
    ).toEqual({ date: "2026-08-24", value: 4 });
    expect(
      result.kpis.revenueSparkline.find((p) => p.date === "2026-08-24"),
    ).toEqual({ date: "2026-08-24", value: 1000 });
  });

  it("degrada a { error } se il DB fallisce, senza propagare (regola 19)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toEqual({
      error: "Impossibile caricare le metriche. Riprova tra qualche istante.",
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_metrics_load" }),
      expect.any(String),
    );
  });

  it("degrada a { error } anche se una query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([docsRow()]);

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toEqual({
      error: "Impossibile caricare le metriche. Riprova tra qualche istante.",
    });
  });

  it("tratta come 0 una colonna null invece di produrre NaN", async () => {
    mockQueries(
      usersRow({ users_total: null }),
      docsRow({ revenue_cents_total: null }),
    );

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: { usersTotal: 0, revenueCentsTotal: 0 },
    });
  });

  it("sopravvive a un json di serie giornaliere arrivato come stringa", async () => {
    // `json_agg` passa da postgres-js come array già parsato, ma un driver o un
    // pooler diverso può consegnarlo come testo: non deve far crollare la pagina.
    mockQueries(
      usersRow({ users_sparkline: '[{"date":"2026-08-25","value":3}]' }),
      docsRow({ daily: '[{"date":"2026-08-25","receipts":1,"cents":500}]' }),
    );

    const result = await getAdminKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(
      result.kpis.usersSparkline.find((p) => p.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 3 });
    expect(
      result.kpis.revenueSparkline.find((p) => p.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 500 });
  });

  it("degrada a serie vuota se il json delle serie è illeggibile", async () => {
    mockQueries(
      usersRow({ users_sparkline: "{non-json" }),
      docsRow({ daily: '{"non":"un array"}' }),
    );

    const result = await getAdminKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    // I punti restano (l'asse è del range), ma tutti a zero: la pagina mostra
    // i totali, che vengono da colonne scalari, invece di non renderizzare.
    expect(result.kpis.usersSparkline).toHaveLength(7);
    expect(result.kpis.usersSparkline.every((p) => p.value === 0)).toBe(true);
    expect(result.kpis.receiptsSparkline.every((p) => p.value === 0)).toBe(
      true,
    );
  });

  it("tratta come 0 un valore numerico non finito invece di propagare NaN", async () => {
    mockQueries(
      usersRow({ users_total: Number.NaN }),
      docsRow({ revenue_cents_total: "non-un-numero" }),
    );

    const result = await getAdminKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: { usersTotal: 0, revenueCentsTotal: 0 },
    });
  });

  it("degrada a serie vuota se la colonna json è null", async () => {
    mockQueries(usersRow({ users_sparkline: null }), docsRow({ daily: null }));

    const result = await getAdminKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.kpis.usersSparkline).toHaveLength(7);
    expect(result.kpis.revenueSparkline.every((p) => p.value === 0)).toBe(true);
  });

  it("ignora i punti di una serie privi di data", async () => {
    mockQueries(usersRow({ users_sparkline: [{ value: 9 }] }));

    const result = await getAdminKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.kpis.usersSparkline.every((p) => p.value === 0)).toBe(true);
  });

  it("esegue due sole query, una per i profili e una per i documenti", async () => {
    mockQueries();

    await getAdminKpis("30d", REFERENCE);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("impone un budget di durata alle query (mai una connessione appesa)", async () => {
    mockQueries();

    await getAdminKpis("30d", REFERENCE);

    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      10_000,
      expect.any(Function),
    );
  });
});
