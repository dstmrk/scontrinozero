// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted: i mock devono essere inizializzati PRIMA del factory vi.mock
// (hoisted in cima) perché l'import statico di ade-recovery — che importa @/db —
// fa girare il factory durante l'hoisting degli import.
const { mockReturning, mockSet, mockSelectWhere } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  // SELECT ... FROM ... WHERE → risolve direttamente nelle righe (no .returning).
  const mockSelectWhere = vi.fn();
  return { mockReturning, mockSet, mockSelectWhere };
});

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({ set: mockSet }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: mockSelectWhere }),
    }),
  }),
}));

vi.mock("@/db/schema", () => ({
  commercialDocuments: "commercial-documents-table",
}));

import {
  buildAdeSearchWindow,
  claimStaleDocument,
  findClaimedTransactionIds,
  formatAdeQueryDate,
  getStalePendingThresholdMs,
  parseAdeResultDate,
  reconcileSaleDocument,
  reconcileVoidDocument,
} from "./ade-recovery";
import type { AdeDocumentSummary } from "@/lib/ade/types";
import { getDb } from "@/db";

function summary(over: Partial<AdeDocumentSummary> = {}): AdeDocumentSummary {
  return {
    idtrx: "154294949",
    numeroProgressivo: "DCW2026/5432-1548",
    cfCliente: "",
    data: "23/02/2026 10:06:14",
    tipoOperazione: "V",
    ammontareComplessivo: 1.7,
    ...over,
  };
}

// createdAt il cui wall-clock italiano (CET, +1 a febbraio) è 23/02/2026 10:06:14.
const SALE_CREATED_AT = new Date("2026-02-23T09:06:14Z");

describe("getStalePendingThresholdMs", () => {
  beforeEach(() => {
    delete process.env.STALE_PENDING_THRESHOLD_MINUTES;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 30 minutes (1_800_000 ms) when the env var is unset", () => {
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("honours a positive override in minutes", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "60");
    expect(getStalePendingThresholdMs()).toBe(60 * 60 * 1000);
  });

  it("honours a fractional minute override", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0.5");
    expect(getStalePendingThresholdMs()).toBe(0.5 * 60 * 1000);
  });

  it("falls back to default on zero (avoids immediate recovery)", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "0");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on negative values", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "-5");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on non-numeric strings", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "abc");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default on NaN string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "NaN");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });

  it("falls back to default when the env var is an empty string", () => {
    vi.stubEnv("STALE_PENDING_THRESHOLD_MINUTES", "");
    expect(getStalePendingThresholdMs()).toBe(30 * 60 * 1000);
  });
});

describe("claimStaleDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockReset();
  });

  it("ritorna true quando il CAS rivendica esattamente 1 riga (claim vinto)", async () => {
    mockReturning.mockResolvedValue([{ id: "doc-1" }]);

    const won = await claimStaleDocument(getDb(), "doc-1", new Date());

    expect(won).toBe(true);
    // Il claim bumpa updated_at per invalidare lo snapshot dei retry concorrenti.
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: expect.any(Date) }),
    );
  });

  it("ritorna false quando il CAS matcha 0 righe (claim perso da un retry concorrente)", async () => {
    mockReturning.mockResolvedValue([]);

    const won = await claimStaleDocument(getDb(), "doc-1", new Date());

    expect(won).toBe(false);
  });
});

describe("findClaimedTransactionIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockReset();
  });

  it("ritorna un set vuoto senza query quando idtrxs è vuoto", async () => {
    const claimed = await findClaimedTransactionIds(getDb(), {
      businessId: "biz-1",
      excludeDocumentId: "doc-1",
      idtrxs: [],
    });
    expect(claimed.size).toBe(0);
    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it("ritorna gli idtrx già collegati ad altre righe del business", async () => {
    mockSelectWhere.mockResolvedValue([{ adeTransactionId: "154295136" }]);

    const claimed = await findClaimedTransactionIds(getDb(), {
      businessId: "biz-1",
      excludeDocumentId: "doc-1",
      idtrxs: ["154294949", "154295136"],
    });

    expect(claimed.has("154295136")).toBe(true);
    expect(claimed.has("154294949")).toBe(false);
  });

  it("scarta gli adeTransactionId null difensivamente", async () => {
    mockSelectWhere.mockResolvedValue([
      { adeTransactionId: null },
      { adeTransactionId: "154295136" },
    ]);

    const claimed = await findClaimedTransactionIds(getDb(), {
      businessId: "biz-1",
      excludeDocumentId: "doc-1",
      idtrxs: ["154295136"],
    });

    expect([...claimed]).toEqual(["154295136"]);
  });
});

describe("reconcile con esclusione claimedIdtrx", () => {
  it("vendita: l'unico candidato è già collegato ad altra riga → none (no falso match)", () => {
    const result = reconcileSaleDocument({
      documents: [summary({ idtrx: "154294949" })],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
      claimedIdtrx: new Set(["154294949"]),
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("vendita: due gemelle ma una già collegata → match sull'orfana residua", () => {
    const result = reconcileSaleDocument({
      documents: [
        summary({ idtrx: "1", numeroProgressivo: "DCW2026/5432-1548" }),
        summary({ idtrx: "2", numeroProgressivo: "DCW2026/5432-1549" }),
      ],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
      claimedIdtrx: new Set(["2"]),
    });
    expect(result).toEqual({
      kind: "match",
      idtrx: "1",
      numeroProgressivo: "DCW2026/5432-1548",
    });
  });

  it("vendita: due orfane identiche, nessuna collegata → resta ambiguous", () => {
    const result = reconcileSaleDocument({
      documents: [
        summary({ idtrx: "1" }),
        summary({ idtrx: "2", numeroProgressivo: "DCW2026/5432-1549" }),
      ],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
      claimedIdtrx: new Set(),
    });
    expect(result).toEqual({ kind: "ambiguous" });
  });

  it("annullo: l'unico candidato è già collegato → none", () => {
    const result = reconcileVoidDocument({
      documents: [
        summary({
          idtrx: "154295136",
          tipoOperazione: "A",
          annulli: "DCW2026/5432-1548",
        }),
      ],
      saleProgressivo: "DCW2026/5432-1548",
      claimedIdtrx: new Set(["154295136"]),
    });
    expect(result).toEqual({ kind: "none" });
  });
});

describe("date helpers AdE (fuso Europe/Rome)", () => {
  it("formatAdeQueryDate emette MM/DD/YYYY in ora italiana (CET, inverno)", () => {
    expect(formatAdeQueryDate(new Date("2026-02-23T09:06:14Z"))).toBe(
      "02/23/2026",
    );
  });

  it("formatAdeQueryDate gestisce il boundary di mezzanotte UTC", () => {
    // 23:30Z del 23/02 = 00:30 del 24/02 ora italiana.
    expect(formatAdeQueryDate(new Date("2026-02-23T23:30:00Z"))).toBe(
      "02/24/2026",
    );
  });

  it("parseAdeResultDate interpreta DD/MM/YYYY HH:MM:SS come ora italiana (CET)", () => {
    expect(parseAdeResultDate("23/02/2026 10:06:14")?.toISOString()).toBe(
      "2026-02-23T09:06:14.000Z",
    );
  });

  it("parseAdeResultDate interpreta l'ora legale (CEST, +2 in estate)", () => {
    expect(parseAdeResultDate("15/07/2026 10:00:00")?.toISOString()).toBe(
      "2026-07-15T08:00:00.000Z",
    );
  });

  it("parseAdeResultDate ritorna null su formato non valido", () => {
    expect(parseAdeResultDate("02/23/2026")).toBeNull();
    expect(parseAdeResultDate("not-a-date")).toBeNull();
  });

  it("buildAdeSearchWindow copre ±1 giorno attorno al createdAt (boundary-safe)", () => {
    const win = buildAdeSearchWindow(new Date("2026-02-23T23:30:00Z"));
    expect(win.dataDal).toBe("02/23/2026");
    expect(win.dataInvioAl).toBe("02/25/2026");
  });
});

describe("reconcileSaleDocument", () => {
  it("ritorna match (idtrx+numeroProgressivo) su importo esatto e tempo vicino", () => {
    const result = reconcileSaleDocument({
      documents: [summary()],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({
      kind: "match",
      idtrx: "154294949",
      numeroProgressivo: "DCW2026/5432-1548",
    });
  });

  it("ritorna none su lista vuota", () => {
    const result = reconcileSaleDocument({
      documents: [],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ritorna none quando l'importo non combacia", () => {
    const result = reconcileSaleDocument({
      documents: [summary({ ammontareComplessivo: 2.5 })],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ritorna none quando il documento è fuori dalla finestra temporale", () => {
    const result = reconcileSaleDocument({
      documents: [summary({ data: "23/02/2026 12:30:00" })],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ignora i documenti di annullo (tipoOperazione A)", () => {
    const result = reconcileSaleDocument({
      documents: [summary({ tipoOperazione: "A" })],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ritorna ambiguous quando due documenti combaciano (conservativo)", () => {
    const result = reconcileSaleDocument({
      documents: [
        summary({ idtrx: "1" }),
        summary({ idtrx: "2", numeroProgressivo: "DCW2026/5432-1549" }),
      ],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result).toEqual({ kind: "ambiguous" });
  });

  it("usa il codice lotteria come chiave secondaria quando presente", () => {
    const docs = [
      summary({ idtrx: "1", cfCliente: "OTHER123" }),
      summary({ idtrx: "2", cfCliente: "YYWLR30G" }),
    ];
    const result = reconcileSaleDocument({
      documents: docs,
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
      lotteryCode: "YYWLR30G",
    });
    expect(result).toEqual({
      kind: "match",
      idtrx: "2",
      numeroProgressivo: "DCW2026/5432-1548",
    });
  });

  it("riconcilia importi frazionari in cents senza drift float (regola 17)", () => {
    // 0.1 * 17 = 1.7000000000000002 in float → ammontareComplessivo arriva 1.7.
    const result = reconcileSaleDocument({
      documents: [summary({ ammontareComplessivo: 1.7 })],
      expectedTotalCents: 170,
      createdAt: SALE_CREATED_AT,
    });
    expect(result.kind).toBe("match");
  });
});

describe("reconcileVoidDocument", () => {
  it("ritorna match sull'annullo legato al progressivo della vendita", () => {
    const docs = [
      summary({
        idtrx: "154295136",
        numeroProgressivo: "DCW2026/5432-1735",
        tipoOperazione: "A",
        annulli: "DCW2026/5432-1548",
      }),
    ];
    const result = reconcileVoidDocument({
      documents: docs,
      saleProgressivo: "DCW2026/5432-1548",
    });
    expect(result).toEqual({
      kind: "match",
      idtrx: "154295136",
      numeroProgressivo: "DCW2026/5432-1735",
    });
  });

  it("ritorna none quando nessun annullo punta alla vendita", () => {
    const result = reconcileVoidDocument({
      documents: [
        summary({ tipoOperazione: "A", annulli: "DCW2026/5432-9999" }),
      ],
      saleProgressivo: "DCW2026/5432-1548",
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ignora le vendite (tipoOperazione V) anche se annulli combacia", () => {
    const result = reconcileVoidDocument({
      documents: [
        summary({ tipoOperazione: "V", annulli: "DCW2026/5432-1548" }),
      ],
      saleProgressivo: "DCW2026/5432-1548",
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("ritorna ambiguous su due annulli per lo stesso progressivo (conservativo)", () => {
    const docs = [
      summary({
        idtrx: "1",
        tipoOperazione: "A",
        annulli: "DCW2026/5432-1548",
      }),
      summary({
        idtrx: "2",
        tipoOperazione: "A",
        annulli: "DCW2026/5432-1548",
      }),
    ];
    const result = reconcileVoidDocument({
      documents: docs,
      saleProgressivo: "DCW2026/5432-1548",
    });
    expect(result).toEqual({ kind: "ambiguous" });
  });
});
