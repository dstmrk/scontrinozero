// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockGetAuthenticatedUser,
  mockCheckBusinessOwnership,
  mockAssertProPlan,
  mockResolveAdeUserSession,
  mockWithAdeSession,
  mockFetchAdeSaleRows,
  mockFindClaimedTransactionIds,
  mockFetchLinesByDocIds,
  mockWhereResults,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockCheckBusinessOwnership: vi.fn(),
  mockAssertProPlan: vi.fn(),
  mockResolveAdeUserSession: vi.fn(),
  mockWithAdeSession: vi.fn(),
  mockFetchAdeSaleRows: vi.fn(),
  mockFindClaimedTransactionIds: vi.fn(),
  mockFetchLinesByDocIds: vi.fn(),
  mockWhereResults: [] as unknown[][],
}));

vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessOwnership: (...args: unknown[]) =>
    mockCheckBusinessOwnership(...args),
}));

vi.mock("@/lib/plans", () => ({ assertProPlan: mockAssertProPlan }));

vi.mock("@/lib/services/ade-user-session", () => ({
  resolveAdeUserSession: mockResolveAdeUserSession,
}));

vi.mock("@/lib/ade", () => ({ withAdeSession: mockWithAdeSession }));

vi.mock("@/lib/ade/log-failure", () => ({ logAdeFailure: vi.fn() }));

// `buildAdeSearchRange` resta reale: è la validazione del periodo, e i test
// del tetto devono passare per quella vera.
vi.mock("@/lib/services/ade-document-search", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/ade-document-search")>();
  return { ...actual, fetchAdeSaleRows: mockFetchAdeSaleRows };
});

vi.mock("@/lib/services/ade-recovery", () => ({
  findClaimedTransactionIds: mockFindClaimedTransactionIds,
}));

vi.mock("@/lib/receipts/document-lines", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/receipts/document-lines")>();
  return { ...actual, fetchLinesByDocIds: mockFetchLinesByDocIds };
});

/**
 * Builder Drizzle finto: ogni `.where()` consuma il prossimo risultato in coda.
 * L'ordine è deterministico — prima l'indice del periodo, poi la rilettura
 * delle righe della pagina.
 */
function makeBuilder() {
  const b = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(() => Promise.resolve(mockWhereResults.shift() ?? [])),
  };
  b.from.mockReturnValue(b);
  b.leftJoin.mockReturnValue(b);
  return b;
}

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({ select: vi.fn(() => makeBuilder()) }),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: (_t: unknown, name: string) => ({
    _alias: name,
    id: `${name}.id`,
    kind: `${name}.kind`,
    status: `${name}.status`,
    voidedDocumentId: `${name}.voided_document_id`,
    adeProgressive: `${name}.ade_progressive`,
    adeRegisteredAt: `${name}.ade_registered_at`,
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: {
    id: "cd.id",
    businessId: "cd.business_id",
    kind: "cd.kind",
    status: "cd.status",
    createdAt: "cd.created_at",
    adeRegisteredAt: "cd.ade_registered_at",
    adeProgressive: "cd.ade_progressive",
    adeTransactionId: "cd.ade_transaction_id",
    publicRequest: "cd.public_request",
  },
  commercialDocumentLines: "commercial-document-lines-table",
}));

import { searchReceiptsIncludingAde } from "./storico-actions";
import { ADE_SEARCH_MAX_DAYS, type AdeReceiptListItem } from "@/types/storico";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BIZ = "11111111-1111-4111-8111-111111111111";
const RANGE = { dateFrom: "2026-08-01", dateTo: "2026-08-31" };

let userSeq = 0;

/** Un utente diverso per test: il rate limiter è reale e conta per utente. */
function nextUser() {
  userSeq += 1;
  return { id: `user-${userSeq}` };
}

function localIndexRow(id: string, iso: string) {
  return { id, adeRegisteredAt: new Date(iso) };
}

/** Riga DB completa, nella forma che `receiptColumns` restituisce. */
function localDocRow(id: string, iso: string, progressive: string) {
  return {
    id,
    kind: "SALE" as const,
    status: "ACCEPTED" as const,
    adeProgressive: progressive,
    adeTransactionId: `idtrx-${id}`,
    createdAt: new Date(iso),
    adeRegisteredAt: new Date(iso),
    voidDocumentId: null,
    voidAdeProgressive: null,
    voidAdeRegisteredAt: null,
    publicRequest: { paymentMethod: "PC" },
  };
}

function adeRow(
  idtrx: string,
  iso: string,
  over: Partial<AdeReceiptListItem> = {},
): AdeReceiptListItem {
  return {
    origin: "ade",
    idtrx,
    adeProgressive: `DCW2026/${idtrx}`,
    adeRegisteredAt: new Date(iso),
    status: "ACCEPTED",
    total: "5.00",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWhereResults.length = 0;
  mockGetAuthenticatedUser.mockResolvedValue(nextUser());
  mockCheckBusinessOwnership.mockResolvedValue(null);
  mockAssertProPlan.mockResolvedValue({ ok: true, plan: "pro" });
  mockResolveAdeUserSession.mockResolvedValue({
    ok: true,
    params: { businessId: BIZ, method: "fisconline" },
  });
  mockWithAdeSession.mockImplementation(
    async (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
      fn({ searchDocuments: vi.fn() }),
  );
  mockFetchAdeSaleRows.mockResolvedValue({ rows: [], truncated: false });
  mockFindClaimedTransactionIds.mockResolvedValue(new Set<string>());
  mockFetchLinesByDocIds.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------

describe("searchReceiptsIncludingAde — guardie", () => {
  it("piano non Pro → rifiuto, e AdE non viene mai interrogata", async () => {
    mockAssertProPlan.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Funzionalità riservata al piano Pro.",
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.error).toBe("Funzionalità riservata al piano Pro.");
    expect(mockResolveAdeUserSession).not.toHaveBeenCalled();
  });

  it("businessId malformato → rifiuto prima di ogni query (regola 9)", async () => {
    const result = await searchReceiptsIncludingAde("non-un-uuid", RANGE);

    expect(result.error).toBe("Identificativo non valido.");
    expect(mockAssertProPlan).not.toHaveBeenCalled();
  });

  it("business di un altro → rifiuto", async () => {
    mockCheckBusinessOwnership.mockResolvedValue({ error: "Non autorizzato." });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.error).toBe("Non autorizzato.");
  });

  it("periodo assente → rifiuto, non una ricerca sull'archivio intero", async () => {
    const result = await searchReceiptsIncludingAde(BIZ, {});

    expect(result.error).toContain("periodo");
    expect(mockResolveAdeUserSession).not.toHaveBeenCalled();
  });

  it("periodo oltre il tetto → rifiuto esplicito, non un elenco solo locale", async () => {
    const result = await searchReceiptsIncludingAde(BIZ, {
      dateFrom: "2024-01-01",
      dateTo: "2026-06-30",
    });

    expect(result.error).toContain(String(ADE_SEARCH_MAX_DAYS));
    expect(result.items).toEqual([]);
  });

  it("un periodo lungo ma ammesso viene spezzato, non rifiutato", async () => {
    // Il vincolo dei 31 giorni è del portale su UNA query: da inizio anno si
    // legge in più query, non si nega.
    mockWhereResults.push([], []);

    const result = await searchReceiptsIncludingAde(BIZ, {
      dateFrom: "2026-01-01",
      dateTo: "2026-06-30",
    });

    expect(result.error).toBeUndefined();
    const ranges = mockFetchAdeSaleRows.mock.calls[0][1];
    expect(ranges).toHaveLength(6);
    // Dalla piu' recente: se il tempo scade, si perde la coda remota del
    // periodo, non i documenti di ieri.
    expect(ranges[0]).toEqual({
      dataDal: "06/01/2026",
      dataInvioAl: "06/30/2026",
    });
    expect(ranges[5]).toEqual({
      dataDal: "01/01/2026",
      dataInvioAl: "01/31/2026",
    });
  });

  it("oltre venti ricerche in un'ora → rate limit", async () => {
    const user = nextUser();
    mockGetAuthenticatedUser.mockResolvedValue(user);

    let last;
    for (let i = 0; i < 21; i++) {
      mockWhereResults.push([], []);
      last = await searchReceiptsIncludingAde(BIZ, RANGE);
    }

    expect(last?.error).toContain("Troppe ricerche");
  });
});

describe("searchReceiptsIncludingAde — fusione delle due sorgenti", () => {
  it("ordina le righe delle due sorgenti in un elenco solo", async () => {
    mockWhereResults.push(
      [localIndexRow("aaa", "2026-08-10T10:00:00Z")],
      [localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1")],
    );
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [
        adeRow("900", "2026-08-11T10:00:00Z"),
        adeRow("800", "2026-08-09T10:00:00Z"),
      ],
      truncated: false,
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(
      result.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)),
    ).toEqual(["900", "aaa", "800"]);
  });

  it("conta i documenti di entrambe le sorgenti", async () => {
    mockWhereResults.push(
      [
        localIndexRow("aaa", "2026-08-10T10:00:00Z"),
        localIndexRow("bbb", "2026-08-12T10:00:00Z"),
      ],
      [
        localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1"),
        localDocRow("bbb", "2026-08-12T10:00:00Z", "DCW2026/1-2"),
      ],
    );
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [adeRow("900", "2026-08-11T10:00:00Z")],
      truncated: false,
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.total).toBe(3);
  });

  it("i nostri documenti non compaiono due volte", async () => {
    // `idtrx-aaa` è già su una nostra riga: l'archivio AdE lo contiene come
    // tutti gli altri, ma nell'elenco deve restare la riga nostra.
    mockWhereResults.push(
      [localIndexRow("aaa", "2026-08-10T10:00:00Z")],
      [localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1")],
    );
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [adeRow("idtrx-aaa", "2026-08-10T10:00:00Z")],
      truncated: false,
    });
    mockFindClaimedTransactionIds.mockResolvedValue(new Set(["idtrx-aaa"]));

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.total).toBe(1);
    expect(result.items[0]?.origin).toBe("local");
  });

  it("la deduplica non esclude nessuna nostra riga a priori", async () => {
    mockWhereResults.push([], []);
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [adeRow("900", "2026-08-11T10:00:00Z")],
      truncated: false,
    });

    await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(mockFindClaimedTransactionIds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ businessId: BIZ, idtrxs: ["900"] }),
    );
  });

  it("il filtro stato vale anche sulle righe AdE", async () => {
    mockWhereResults.push([], []);
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [
        adeRow("900", "2026-08-11T10:00:00Z", { status: "VOID_ACCEPTED" }),
        adeRow("901", "2026-08-11T11:00:00Z", { status: "ACCEPTED" }),
      ],
      truncated: false,
    });

    const result = await searchReceiptsIncludingAde(BIZ, {
      ...RANGE,
      status: "ACCEPTED",
    });

    expect(
      result.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)),
    ).toEqual(["901"]);
  });

  it("taglia le righe AdE fuori dalla giornata italiana", async () => {
    // I query param AdE hanno granularità di giorno: il portale può
    // restituire righe oltre la mezzanotte italiana che chiude il periodo.
    mockWhereResults.push([], []);
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [
        adeRow("900", "2026-08-31T21:00:00Z"), // 31/08 23:00 a Roma — dentro
        adeRow("901", "2026-08-31T23:00:00Z"), // 01/09 01:00 a Roma — fuori
      ],
      truncated: false,
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(
      result.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)),
    ).toEqual(["900"]);
  });

  it("impagina sull'elenco fuso, non su una sola sorgente", async () => {
    mockWhereResults.push(
      [localIndexRow("aaa", "2026-08-10T10:00:00Z")],
      [localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1")],
    );
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [
        adeRow("900", "2026-08-12T10:00:00Z"),
        adeRow("901", "2026-08-11T10:00:00Z"),
      ],
      truncated: false,
    });

    const result = await searchReceiptsIncludingAde(BIZ, {
      ...RANGE,
      page: 2,
      pageSize: 2,
    });

    expect(
      result.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)),
    ).toEqual(["aaa"]);
    expect(result.total).toBe(3);
  });

  it("a parità di istante l'ordine è stabile fra le due sorgenti", async () => {
    const sameMoment = "2026-08-10T10:00:00Z";
    mockWhereResults.push(
      [localIndexRow("aaa", sameMoment)],
      [localDocRow("aaa", sameMoment, "DCW2026/1-1")],
    );
    mockFetchAdeSaleRows.mockResolvedValue({
      rows: [adeRow("900", sameMoment)],
      truncated: false,
    });

    const first = await searchReceiptsIncludingAde(BIZ, RANGE);

    mockWhereResults.push(
      [localIndexRow("aaa", sameMoment)],
      [localDocRow("aaa", sameMoment, "DCW2026/1-1")],
    );
    const second = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(
      first.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)),
    ).toEqual(second.items.map((r) => (r.origin === "ade" ? r.idtrx : r.id)));
  });
});

describe("searchReceiptsIncludingAde — degrado (regola 19)", () => {
  it("AdE irraggiungibile → le righe nostre restano, con l'avviso", async () => {
    mockWhereResults.push(
      [localIndexRow("aaa", "2026-08-10T10:00:00Z")],
      [localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1")],
    );
    mockWithAdeSession.mockRejectedValue(new Error("ECONNRESET"));

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.items).toHaveLength(1);
    expect(result.adeError).toContain("non raggiungibile");
    expect(result.error).toBeUndefined();
  });

  it("CIE senza sessione → avviso di ricollegamento, elenco locale intatto", async () => {
    mockWhereResults.push(
      [localIndexRow("aaa", "2026-08-10T10:00:00Z")],
      [localDocRow("aaa", "2026-08-10T10:00:00Z", "DCW2026/1-1")],
    );
    mockResolveAdeUserSession.mockResolvedValue({
      ok: false,
      reason: "cie-reauth",
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.adeReauthRequired).toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it("credenziali AdE assenti → il messaggio dei prerequisiti, non un errore generico", async () => {
    mockWhereResults.push([], []);
    mockResolveAdeUserSession.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      error: "Credenziali AdE non trovate. Completa la configurazione.",
    });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.adeError).toBe(
      "Credenziali AdE non trovate. Completa la configurazione.",
    );
  });

  it("archivio troncato → il flag arriva alla UI", async () => {
    mockWhereResults.push([], []);
    mockFetchAdeSaleRows.mockResolvedValue({ rows: [], truncated: true });

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.adeTruncated).toBe(true);
  });

  it("una riga sparita fra indice e rilettura non lascia un guscio", async () => {
    mockWhereResults.push([localIndexRow("aaa", "2026-08-10T10:00:00Z")], []);

    const result = await searchReceiptsIncludingAde(BIZ, RANGE);

    expect(result.items).toEqual([]);
  });
});
