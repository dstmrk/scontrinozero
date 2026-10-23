// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdeSessionCache, type CachedAdeClient } from "@/lib/ade/session-cache";
import type { AdeDocumentSummary } from "@/lib/ade/types";

const {
  mockResolveAdeUserSession,
  mockWithAdeSession,
  mockFindClaimedTransactionIds,
  mockLogAdeFailure,
} = vi.hoisted(() => ({
  mockResolveAdeUserSession: vi.fn(),
  mockWithAdeSession: vi.fn(),
  mockFindClaimedTransactionIds: vi.fn(),
  mockLogAdeFailure: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/ade", () => ({ withAdeSession: mockWithAdeSession }));
vi.mock("@/lib/ade/log-failure", () => ({ logAdeFailure: mockLogAdeFailure }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
// Solo la deduplica: `parseAdeResultDate` resta vero, lo usa la ricerca.
vi.mock("./ade-recovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ade-recovery")>()),
  findClaimedTransactionIds: mockFindClaimedTransactionIds,
}));
vi.mock("./ade-user-session", () => ({
  resolveAdeUserSession: mockResolveAdeUserSession,
}));

import { ADE_UNREACHABLE, fetchForeignAdeRows } from "./ade-storico-rows";

const BIZ = "11111111-1111-4111-8111-111111111111";
const LOGIN = {
  credentials: { codiceFiscale: "RSSMRA80A01H501U", password: "x", pin: "y" },
  credentialVersion: new Date("2026-10-01T08:00:00.000Z"),
};

/** Due mesi, dal più recente: ogni finestra sta in una pagina sola. */
const PARAMS = {
  businessId: BIZ,
  ranges: [
    { dataDal: "09/01/2026", dataInvioAl: "09/30/2026" },
    { dataDal: "08/01/2026", dataInvioAl: "08/31/2026" },
  ],
  from: null,
  toExclusive: null,
};

function saleDoc(idtrx: string, data: string): AdeDocumentSummary {
  return {
    idtrx,
    numeroProgressivo: `DCW2026/2610-${idtrx}`,
    cfCliente: "",
    data,
    tipoOperazione: "V",
    ammontareComplessivo: 1.9,
  };
}

function pageFor(query: { dataDal: string }) {
  const doc =
    query.dataDal === "09/01/2026"
      ? saleDoc("900", "10/09/2026 10:00:00")
      : saleDoc("800", "10/08/2026 10:00:00");
  return { totalCount: 1, elencoRisultati: [doc] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveAdeUserSession.mockResolvedValue({
    ok: true,
    params: { businessId: BIZ, method: "fisconline" },
  });
  mockFindClaimedTransactionIds.mockResolvedValue(new Set<string>());
});

// Issue #1099: la ricerca sull'archivio AdE può durare fino a 45 s. Dentro
// una sola sessione teneva il lock per attività per tutto quel tempo, e con
// più persone alla cassa una ricerca del titolare fermava ogni emissione.
describe("fetchForeignAdeRows — una sessione per pagina", () => {
  it("entra nella sessione AdE a ogni pagina, non una volta per la ricerca", async () => {
    const searchDocuments = vi.fn(async (query) => pageFor(query));
    mockWithAdeSession.mockImplementation(
      async (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
        fn({ searchDocuments }),
    );

    const result = await fetchForeignAdeRows(PARAMS);

    expect(mockWithAdeSession).toHaveBeenCalledTimes(2);
    expect(searchDocuments).toHaveBeenCalledTimes(2);
    expect("rows" in result && result.rows.map((r) => r.idtrx)).toEqual([
      "900",
      "800",
    ]);
  });

  it("la granularità è la pagina: due pagine dello stesso mese, due sessioni", async () => {
    const searchDocuments = vi.fn(async ({ page }: { page?: number }) => ({
      totalCount: 2,
      elencoRisultati: [
        saleDoc(page === 1 ? "901" : "902", "10/09/2026 10:00:00"),
      ],
    }));
    mockWithAdeSession.mockImplementation(
      async (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
        fn({ searchDocuments }),
    );

    await fetchForeignAdeRows({ ...PARAMS, ranges: [PARAMS.ranges[0]] });

    expect(mockWithAdeSession).toHaveBeenCalledTimes(2);
    expect(searchDocuments.mock.calls.map(([q]) => q.page)).toEqual([1, 2]);
  });

  it("un errore alla seconda pagina degrada come uno alla prima", async () => {
    // Come prima della issue #1099: l'avviso dice che l'elenco mostra solo i
    // documenti di ScontrinoZero, e mostrare a metà quelli AdE lo smentirebbe.
    mockWithAdeSession
      .mockImplementationOnce(
        async (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
          fn({ searchDocuments: async (q: { dataDal: string }) => pageFor(q) }),
      )
      .mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await fetchForeignAdeRows(PARAMS);

    expect(result).toEqual({ adeError: ADE_UNREACHABLE });
  });

  it("un'emissione arrivata durante la ricerca passa fra una pagina e l'altra", async () => {
    // Lock vero: la stessa AdeSessionCache che serializza le operazioni di
    // un'attività in produzione, con un client finto.
    const order: string[] = [];
    let releaseFirstPage!: () => void;
    const firstPageGate = new Promise<void>((resolve) => {
      releaseFirstPage = resolve;
    });
    const client: CachedAdeClient = {
      login: vi.fn().mockResolvedValue({
        pAuth: "p",
        partitaIva: "01234567890",
        createdAt: 0,
      }),
      setCredentials: vi.fn(),
      clearCredentials: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      searchDocuments: vi.fn(async (query: { dataDal: string }) => {
        order.push(`page ${query.dataDal}`);
        if (query.dataDal === "09/01/2026") await firstPageGate;
        return pageFor(query);
      }),
    } as unknown as CachedAdeClient;
    const cache = new AdeSessionCache({ createClient: () => client });
    mockWithAdeSession.mockImplementation(
      (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
        cache.run(BIZ, LOGIN, fn),
    );

    const search = fetchForeignAdeRows(PARAMS);
    // Aspetta che la prima pagina sia in volo, poi accoda un'emissione.
    await vi.waitFor(() => expect(order).toEqual(["page 09/01/2026"]));
    const emission = cache.run(BIZ, LOGIN, async () => {
      order.push("emissione");
    });
    releaseFirstPage();
    await Promise.all([search, emission]);

    expect(order).toEqual(["page 09/01/2026", "emissione", "page 08/01/2026"]);
  });

  it("un errore su una pagina dà l'avviso, come quando falliva la sessione intera", async () => {
    mockWithAdeSession.mockRejectedValue(new Error("ECONNRESET"));

    const result = await fetchForeignAdeRows(PARAMS);

    expect(result).toEqual({ adeError: ADE_UNREACHABLE });
    expect(mockLogAdeFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ businessId: BIZ, flow: "storico-search" }),
      expect.any(Object),
    );
  });

  it("senza sessione utilizzabile non interroga l'AdE", async () => {
    mockResolveAdeUserSession.mockResolvedValue({
      ok: false,
      reason: "unavailable",
      error: "Credenziali AdE non verificate.",
    });

    const result = await fetchForeignAdeRows(PARAMS);

    expect(result).toEqual({ adeError: "Credenziali AdE non verificate." });
    expect(mockWithAdeSession).not.toHaveBeenCalled();
  });

  it("toglie i documenti già nostri, riconosciuti dall'idtrx", async () => {
    mockWithAdeSession.mockImplementation(
      async (_params: unknown, fn: (c: unknown) => Promise<unknown>) =>
        fn({ searchDocuments: async (q: { dataDal: string }) => pageFor(q) }),
    );
    mockFindClaimedTransactionIds.mockResolvedValue(new Set(["900"]));

    const result = await fetchForeignAdeRows(PARAMS);

    expect("rows" in result && result.rows.map((r) => r.idtrx)).toEqual([
      "800",
    ]);
  });
});
