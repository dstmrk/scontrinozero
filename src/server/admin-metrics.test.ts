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
// callback con una tx che espone lo stesso mock di execute. `runAdminRead` ci
// passa sopra: qui interessa la query, il tetto di concorrenza ha i suoi test
// in `admin-sql.test.ts`.
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
import { getAdminDocumentKpis, getAdminUserKpis } from "./admin-metrics";

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

const USERS_ERROR =
  "Impossibile caricare le metriche utenti. Riprova tra qualche istante.";
const DOCUMENTS_ERROR =
  "Impossibile caricare le metriche scontrini. Riprova tra qualche istante.";

const REFERENCE = new Date("2026-08-26T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminUserKpis", () => {
  it("converte in numeri i bigint che il driver restituisce come stringhe", async () => {
    mockExecute.mockResolvedValueOnce([usersRow()]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: { usersTotal: 120, usersInRange: 8, trialsActive: 5 },
    });
  });

  it("calcola il tasso di conversione trial come convertiti/partiti", async () => {
    mockExecute.mockResolvedValueOnce([
      usersRow({ trial_cohort_started: "20", trial_cohort_converted: "7" }),
    ]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { trialConversionRate: 0.35 } });
  });

  it("ritorna conversione 0 quando nessun trial è partito nella finestra", async () => {
    mockExecute.mockResolvedValueOnce([
      usersRow({ trial_cohort_started: "0", trial_cohort_converted: "0" }),
    ]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { trialConversionRate: 0 } });
  });

  it("riempie di zeri i giorni senza dati, sull'asse fiscale italiano", async () => {
    mockExecute.mockResolvedValueOnce([
      usersRow({ users_sparkline: [{ date: "2026-08-25", value: 3 }] }),
    ]);

    const result = await getAdminUserKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    // 7d = [20 ago 00:00 Rome, 27 ago 00:00 Rome) → 7 punti.
    expect(result.kpis.usersSparkline).toHaveLength(7);
    expect(result.kpis.usersSparkline.at(-1)).toEqual({
      date: "2026-08-26",
      value: 0,
    });
    expect(
      result.kpis.usersSparkline.find((point) => point.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 3 });
  });

  it("degrada a { error } se il DB fallisce, senza propagare (regola 19)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toEqual({ error: USERS_ERROR });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_metrics_load" }),
      expect.any(String),
    );
  });

  it("degrada a { error } anche se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toEqual({ error: USERS_ERROR });
  });

  it("tratta come 0 una colonna null invece di produrre NaN", async () => {
    mockExecute.mockResolvedValueOnce([usersRow({ users_total: null })]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { usersTotal: 0 } });
  });

  it("tratta come 0 un valore numerico non finito invece di propagare NaN", async () => {
    mockExecute.mockResolvedValueOnce([usersRow({ users_total: Number.NaN })]);

    const result = await getAdminUserKpis("30d", REFERENCE);

    expect(result).toMatchObject({ kpis: { usersTotal: 0 } });
  });

  it("sopravvive a un json di serie arrivato come stringa", async () => {
    // `json_agg` passa da postgres-js come array già parsato, ma un driver o un
    // pooler diverso può consegnarlo come testo: non deve far crollare la pagina.
    mockExecute.mockResolvedValueOnce([
      usersRow({ users_sparkline: '[{"date":"2026-08-25","value":3}]' }),
    ]);

    const result = await getAdminUserKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(
      result.kpis.usersSparkline.find((point) => point.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 3 });
  });

  it("degrada a serie di zeri se il json è illeggibile o null", async () => {
    mockExecute
      .mockResolvedValueOnce([usersRow({ users_sparkline: "{non-json" })])
      .mockResolvedValueOnce([usersRow({ users_sparkline: null })]);

    const illeggibile = await getAdminUserKpis("7d", REFERENCE);
    const nulla = await getAdminUserKpis("7d", REFERENCE);

    if ("error" in illeggibile || "error" in nulla) {
      throw new Error("atteso successo");
    }
    // I punti restano (l'asse è del range), ma tutti a zero: la pagina mostra
    // i totali, che vengono da colonne scalari, invece di non renderizzare.
    expect(illeggibile.kpis.usersSparkline).toHaveLength(7);
    expect(
      illeggibile.kpis.usersSparkline.every((point) => point.value === 0),
    ).toBe(true);
    expect(nulla.kpis.usersSparkline.every((point) => point.value === 0)).toBe(
      true,
    );
  });

  it("ignora i punti di una serie privi di data", async () => {
    mockExecute.mockResolvedValueOnce([
      usersRow({ users_sparkline: [{ value: 9 }] }),
    ]);

    const result = await getAdminUserKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.kpis.usersSparkline.every((point) => point.value === 0)).toBe(
      true,
    );
  });

  it("esegue una sola query e le impone un budget di durata", async () => {
    mockExecute.mockResolvedValueOnce([usersRow()]);

    await getAdminUserKpis("30d", REFERENCE);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      10_000,
      expect.any(Function),
    );
  });

  it("non legge i documenti: le card utenti non aspettano lo storico scontrini", async () => {
    // Il motivo per cui questa lettura è separata. Se un domani qualcuno
    // rimettesse dentro una query su `commercial_documents`, le tre card
    // utenti tornerebbero ad aspettare la scansione più lenta del pannello.
    mockExecute.mockResolvedValueOnce([usersRow()]);

    await getAdminUserKpis("30d", REFERENCE);

    const queried = sqlTextOf(mockExecute.mock.calls[0][0]);
    expect(queried).toContain("profiles");
    expect(queried).not.toContain("commercial_documents");
  });
});

describe("getAdminDocumentKpis", () => {
  it("converte in numeri i bigint che il driver restituisce come stringhe", async () => {
    mockExecute.mockResolvedValueOnce([docsRow()]);

    const result = await getAdminDocumentKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: {
        receiptsTotal: 900,
        receiptsInRange: 30,
        revenueCentsTotal: 1234567,
        revenueCentsInRange: 45678,
        voidedInRange: 2,
      },
    });
  });

  it("estrae dalla stessa serie giornaliera scontrini e incasso", async () => {
    mockExecute.mockResolvedValueOnce([
      docsRow({ daily: [{ date: "2026-08-24", receipts: 4, cents: 1000 }] }),
    ]);

    const result = await getAdminDocumentKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(result.kpis.receiptsSparkline).toHaveLength(7);
    expect(result.kpis.revenueSparkline).toHaveLength(7);
    expect(
      result.kpis.receiptsSparkline.find(
        (point) => point.date === "2026-08-24",
      ),
    ).toEqual({ date: "2026-08-24", value: 4 });
    expect(
      result.kpis.revenueSparkline.find((point) => point.date === "2026-08-24"),
    ).toEqual({ date: "2026-08-24", value: 1000 });
  });

  it("degrada a { error } se il DB fallisce, senza propagare (regola 19)", async () => {
    mockExecute.mockRejectedValueOnce(new Error("connection terminated"));

    const result = await getAdminDocumentKpis("30d", REFERENCE);

    expect(result).toEqual({ error: DOCUMENTS_ERROR });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: "admin_metrics_load" }),
      expect.any(String),
    );
  });

  it("degrada a { error } anche se la query non restituisce righe", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getAdminDocumentKpis("30d", REFERENCE);

    expect(result).toEqual({ error: DOCUMENTS_ERROR });
  });

  it("marca il log con la lettura caduta, non solo con il pannello", async () => {
    // Gemello del campo `list` degli elenchi: con sei blocchi indipendenti un
    // `errorClass` uguale per tutti dice che il pannello ha un problema, non
    // quale delle sei query lo ha.
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    await getAdminDocumentKpis("30d", REFERENCE);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorClass: "admin_metrics_load",
        metric: "documents",
      }),
      expect.any(String),
    );
  });

  it("distingue il proprio messaggio d'errore da quello delle metriche utenti", async () => {
    // Con sei blocchi indipendenti un testo generico non direbbe QUALE è caduto.
    mockExecute.mockRejectedValueOnce(new Error("boom"));
    const documenti = await getAdminDocumentKpis("30d", REFERENCE);

    mockExecute.mockRejectedValueOnce(new Error("boom"));
    const utenti = await getAdminUserKpis("30d", REFERENCE);

    expect(documenti).not.toEqual(utenti);
  });

  it("tratta come 0 colonne null o non numeriche invece di propagare NaN", async () => {
    mockExecute.mockResolvedValueOnce([
      docsRow({ revenue_cents_total: null, receipts_total: "non-un-numero" }),
    ]);

    const result = await getAdminDocumentKpis("30d", REFERENCE);

    expect(result).toMatchObject({
      kpis: { revenueCentsTotal: 0, receiptsTotal: 0 },
    });
  });

  it("sopravvive a un json di serie arrivato come stringa", async () => {
    mockExecute.mockResolvedValueOnce([
      docsRow({ daily: '[{"date":"2026-08-25","receipts":1,"cents":500}]' }),
    ]);

    const result = await getAdminDocumentKpis("7d", REFERENCE);

    if ("error" in result) throw new Error("atteso successo");
    expect(
      result.kpis.revenueSparkline.find((point) => point.date === "2026-08-25"),
    ).toEqual({ date: "2026-08-25", value: 500 });
  });

  it("degrada a serie di zeri se il json è illeggibile o null", async () => {
    mockExecute
      .mockResolvedValueOnce([docsRow({ daily: '{"non":"un array"}' })])
      .mockResolvedValueOnce([docsRow({ daily: null })]);

    const illeggibile = await getAdminDocumentKpis("7d", REFERENCE);
    const nulla = await getAdminDocumentKpis("7d", REFERENCE);

    if ("error" in illeggibile || "error" in nulla) {
      throw new Error("atteso successo");
    }
    expect(illeggibile.kpis.receiptsSparkline).toHaveLength(7);
    expect(
      illeggibile.kpis.receiptsSparkline.every((point) => point.value === 0),
    ).toBe(true);
    expect(
      nulla.kpis.revenueSparkline.every((point) => point.value === 0),
    ).toBe(true);
  });

  it("esegue una sola query e le impone un budget di durata", async () => {
    mockExecute.mockResolvedValueOnce([docsRow()]);

    await getAdminDocumentKpis("30d", REFERENCE);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockWithStatementTimeout).toHaveBeenCalledWith(
      10_000,
      expect.any(Function),
    );
  });
});
