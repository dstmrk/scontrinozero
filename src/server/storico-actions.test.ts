// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/auth-errors";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAuthenticatedUser = vi.fn();
const mockCheckBusinessMembership = vi.fn();
vi.mock("@/lib/server-auth", () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
  checkBusinessMembership: (...args: unknown[]) =>
    mockCheckBusinessMembership(...args),
}));

const mockSelect = vi.fn();

const mockGetPlanSafe = vi.fn();
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanSafe: (...args: unknown[]) => mockGetPlanSafe(...args),
}));

vi.mock("@/db", () => ({
  getDb: vi.fn().mockReturnValue({
    select: mockSelect,
  }),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: (_table: unknown, name: string) => ({
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
    returnedDocumentId: "cd.returned_document_id",
    createdBy: "cd.created_by",
  },
  commercialDocumentLines: "commercial-document-lines-table",
}));

// Stubbati solo i costruttori di condizione che i test ispezionano: `desc`
// negli argomenti di .orderBy, `and`/`gte`/`lt` in quelli di .where (marker
// leggibili al posto degli oggetti SQL di drizzle). Il resto resta reale.
// Nessun builder mockato guarda gli argomenti di .where, quindi il marker non
// altera il comportamento delle altre query.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    desc: (col: unknown) => ({ _desc: col }),
    and: (...args: unknown[]) => ({ _and: args }),
    eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    gte: (a: unknown, b: unknown) => ({ _gte: [a, b] }),
    lt: (a: unknown, b: unknown) => ({ _lt: [a, b] }),
    like: (a: unknown, b: unknown) => ({ _like: [a, b] }),
  };
});

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/** Simula la query COUNT: risolve al .where() */
function makeCountBuilder(n: number) {
  const b = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue([{ value: n }]),
  };
  b.from.mockReturnValue(b);
  return b;
}

/** Simula la query docs paginata: risolve al .offset() */
function makeDocsBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  b.leftJoin.mockReturnValue(b);
  b.where.mockReturnValue(b);
  b.orderBy.mockReturnValue(b);
  b.limit.mockReturnValue(b);
  return b;
}

/** Simula la query del singolo documento: risolve al .limit() */
function makeDetailBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  b.leftJoin.mockReturnValue(b);
  b.where.mockReturnValue(b);
  return b;
}

/** Simula la query dei resi accettati di una pagina: risolve al .where() */
function makeReturnsBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  return b;
}

/** Simula la query lines: risolve al .orderBy() */
function makeLinesBuilder(result: unknown[]) {
  const b = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(result),
  };
  b.from.mockReturnValue(b);
  b.where.mockReturnValue(b);
  return b;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = { id: "user-123" };

const FAKE_SALE_DOC = {
  id: "sale-doc-uuid",
  businessId: "11111111-1111-4111-8111-111111111111",
  kind: "SALE",
  status: "ACCEPTED",
  adeTransactionId: "trx-001",
  adeProgressive: "DCW2026/5111-2188",
  // Deliberatamente diverse: l'INSERT precede la risposta AdE.
  createdAt: new Date("2026-02-15T09:59:57Z"),
  adeRegisteredAt: new Date("2026-02-15T10:00:00Z"),
};

const FAKE_DOC_LINES = [
  {
    id: "line-1",
    documentId: "sale-doc-uuid",
    lineIndex: 0,
    description: "Pizza",
    quantity: "2.000",
    grossUnitPrice: "5.00",
    vatCode: "10",
    adeLineId: null,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Il titolare: oggi l'unico membro possibile di un'attività (issue #1099). */
const OWNER_MEMBERSHIP = { memberId: "member-owner", role: "owner" } as const;
const COLLABORATOR_MEMBERSHIP = {
  memberId: "member-collab",
  role: "collaborator",
} as const;

/** Le condizioni passate a `.where` da un builder, come marker leggibili. */
function whereConditions(builder: { where: ReturnType<typeof vi.fn> }) {
  return (builder.where.mock.calls[0][0] as { _and: unknown[] })._and;
}

const OWN_DOCUMENTS = { _eq: ["cd.created_by", "member-collab"] };

describe("storico-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // La query dei resi segue quella delle righe solo quando la pagina ha
    // vendite: senza un valore accodato, nessun reso.
    mockSelect.mockImplementation(() => makeReturnsBuilder([]));

    mockGetAuthenticatedUser.mockResolvedValue(FAKE_USER);
    mockCheckBusinessMembership.mockResolvedValue(OWNER_MEMBERSHIP);
  });

  describe("searchReceipts", () => {
    // La riga alimenta la ristampa su termica (`void-receipt-dialog`): senza il
    // timestamp fiscale la carta porterebbe un orario diverso dal PDF.
    it("espone ade_registered_at, distinto dal createdAt della riga", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].adeRegisteredAt).toEqual(
        new Date("2026-02-15T10:00:00Z"),
      );
      expect(result.items[0].createdAt).toEqual(
        new Date("2026-02-15T09:59:57Z"),
      );
    });

    // Entry point della ricevuta di annullamento: dal dettaglio di una
    // vendita annullata l'esercente deve poter aprire e stampare l'annullo.
    // Senza questi campi la riga e' un vicolo cieco (PR #836).
    it("espone l'annullo collegato su una vendita annullata", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(
          makeDocsBuilder([
            {
              ...FAKE_SALE_DOC,
              status: "VOID_ACCEPTED",
              voidDocumentId: "void-doc-uuid",
              voidAdeProgressive: "DCW2026/5111-2189",
              voidAdeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
            },
          ]),
        )
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].voidDocument).toEqual({
        id: "void-doc-uuid",
        adeProgressive: "DCW2026/5111-2189",
        adeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
      });
    });

    it("lascia voidDocument null su una vendita non annullata", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].voidDocument).toBeNull();
    });

    // Il reso è una riga dello storico a sé: porta la vendita che rettifica,
    // e la pagina di soli resi non chiede i pezzi resi (non ha vendite).
    it("espone su un reso la vendita rettificata, senza query dei resi", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(
          makeDocsBuilder([
            {
              ...FAKE_SALE_DOC,
              id: "return-doc-uuid",
              kind: "RETURN",
              adeProgressive: "DCW2026/5111-2190",
              returnOfId: "sale-doc-uuid",
              returnOfAdeProgressive: "DCW2026/5111-2188",
              returnOfAdeRegisteredAt: new Date("2026-02-15T10:00:00Z"),
            },
          ]),
        )
        .mockReturnValueOnce(
          makeLinesBuilder(
            FAKE_DOC_LINES.map((l) => ({
              ...l,
              documentId: "return-doc-uuid",
              quantity: "1.000",
            })),
          ),
        );

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].kind).toBe("RETURN");
      expect(result.items[0].returnOf).toEqual({
        id: "sale-doc-uuid",
        adeProgressive: "DCW2026/5111-2188",
        adeRegisteredAt: new Date("2026-02-15T10:00:00Z"),
      });
      expect(result.items[0].total).toBe("5.00");
      expect(mockSelect).toHaveBeenCalledTimes(3);
    });

    // Il dialog di reso limita ogni riga a quantità − già reso: la somma
    // attraversa più resi della stessa vendita, per `lineIndex`.
    it("somma per riga i pezzi resi dai resi accettati della vendita", async () => {
      const saleLines = [
        ...FAKE_DOC_LINES,
        { ...FAKE_DOC_LINES[0], id: "line-2", lineIndex: 1, quantity: "1.000" },
      ];
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(saleLines))
        .mockReturnValueOnce(
          makeReturnsBuilder([
            { id: "ret-1", saleId: "sale-doc-uuid" },
            { id: "ret-2", saleId: "sale-doc-uuid" },
          ]),
        )
        .mockReturnValueOnce(
          makeLinesBuilder([
            { documentId: "ret-1", lineIndex: 0, quantity: "1.000" },
            { documentId: "ret-2", lineIndex: 0, quantity: "0.500" },
            // Riga orfana (reso non in pagina): ignorata, non lancia.
            { documentId: "ret-x", lineIndex: 0, quantity: "9.000" },
          ]),
        );

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].lines.map((l) => l.returnedQuantity)).toEqual([
        "1.5",
        "0",
      ]);
      expect(result.items[0].returnOf).toBeNull();
    });

    it("returns receipts with computed totals and sorted lines", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("sale-doc-uuid");
      expect(result.items[0].kind).toBe("SALE");
      expect(result.items[0].status).toBe("ACCEPTED");
      expect(result.items[0].adeProgressive).toBe("DCW2026/5111-2188");
      // Total: 2 * 5.00 = 10.00
      expect(result.items[0].total).toBe("10.00");
      expect(result.items[0].lines).toHaveLength(1);
      expect(result.items[0].lines[0].description).toBe("Pizza");
    });

    it("riporta il metodo di pagamento reale del documento", async () => {
      // La ristampa su termica consegna una copia al cliente: non può
      // riportare un pagamento diverso da quello trasmesso all'AdE.
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(
          makeDocsBuilder([
            {
              ...FAKE_SALE_DOC,
              publicRequest: { paymentMethod: "PE", lotteryCode: "ABCD1234" },
            },
          ]),
        )
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].paymentMethod).toBe("PE");
      expect(result.items[0].lotteryCode).toBe("ABCD1234");
    });

    it("ripiega su contante quando publicRequest è assente (righe storiche)", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(
          makeDocsBuilder([{ ...FAKE_SALE_DOC, publicRequest: null }]),
        )
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].paymentMethod).toBe("PC");
      expect(result.items[0].lotteryCode).toBeNull();
    });

    it("scarta un publicRequest di forma inattesa senza lanciare", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(
          makeDocsBuilder([
            {
              ...FAKE_SALE_DOC,
              publicRequest: { paymentMethod: 42, lotteryCode: [] },
            },
          ]),
        )
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items[0].paymentMethod).toBe("PC");
      expect(result.items[0].lotteryCode).toBeNull();
    });

    it("returns empty items and total 0 when no documents found", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(0))
        .mockReturnValueOnce(makeDocsBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      // Lines query should NOT be called when there are no docs
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (no throw, no Sentry)", async () => {
      // Sessione scaduta con lo storico aperto: getAuthenticatedUser lancia
      // UnauthenticatedError; searchReceipts deve degradare a { error } inline
      // (regola 19/20), non propagare all'error boundary di Next.
      mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(result.error).toBe("Non autenticato.");
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockCheckBusinessMembership).not.toHaveBeenCalled();
    });

    it("returns error envelope when business ownership check fails", async () => {
      mockCheckBusinessMembership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );
      expect(result.error).toBe("Business non trovato o non autorizzato.");
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("guard UUID (regola 9): businessId malformato → error envelope senza ownership check", async () => {
      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts("abc");

      expect(result.error).toBe("Identificativo non valido.");
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockCheckBusinessMembership).not.toHaveBeenCalled();
    });

    it("filters by status when provided", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        { status: "ACCEPTED" },
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe("ACCEPTED");
    });

    it("returns only ACCEPTED and VOID_ACCEPTED when status param is omitted", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        {},
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      // Verify no ERROR/REJECTED/PENDING leak through
      result.items.forEach((r) => {
        expect(["ACCEPTED", "VOID_ACCEPTED"]).toContain(r.status);
      });
    });

    it("filters by dateFrom when provided", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        {
          dateFrom: "2026-01-01",
        },
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      // Il periodo si seleziona sulla data mostrata dalla riga: con il
      // predicato su `created_at` una vendita registrata dall'AdE il 1°
      // febbraio compariva filtrando gennaio, datata 01/02. L'estremo e' la
      // mezzanotte **italiana** (23:00 UTC del giorno prima, CET).
      const conditions = (
        docsBuilder.where.mock.calls[0][0] as { _and: unknown[] }
      )._and;
      expect(conditions).toContainEqual({
        _gte: ["cd.ade_registered_at", new Date("2025-12-31T23:00:00.000Z")],
      });
    });

    it("filters by dateTo when provided", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        { dateTo: "2026-03-01" },
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      // Estremo superiore esclusivo: l'inizio del giorno italiano successivo,
      // cosi' il giorno indicato e' incluso per intero.
      const conditions = (
        docsBuilder.where.mock.calls[0][0] as { _and: unknown[] }
      )._and;
      expect(conditions).toContainEqual({
        _lt: ["cd.ade_registered_at", new Date("2026-03-01T23:00:00.000Z")],
      });
    });

    it("rounds total to 2 decimal places correctly", async () => {
      const lines = [
        {
          id: "line-1",
          documentId: "sale-doc-uuid",
          lineIndex: 0,
          description: "Item",
          quantity: "3.000",
          grossUnitPrice: "0.10",
          vatCode: "22",
          adeLineId: null,
        },
      ];
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(makeDocsBuilder([FAKE_SALE_DOC]))
        .mockReturnValueOnce(makeLinesBuilder(lines));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
      );

      // 3 * 0.10 = 0.30 (without rounding: 0.30000000000000004)
      expect(result.items[0].total).toBe("0.30");
    });

    it("applies LIMIT and OFFSET for the requested page", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(25))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        { page: 2, pageSize: 10 },
      );

      expect(result.total).toBe(25);
      expect(docsBuilder.limit).toHaveBeenCalledWith(10);
      expect(docsBuilder.offset).toHaveBeenCalledWith(10); // (2-1) * 10
    });

    // Una server action è raggiungibile con qualunque valore: i tipi di
    // TypeScript non esistono a runtime. Un `status` fuori dall'enum faceva
    // lanciare Postgres (22P02) e un `page` NaN/Infinity/frazionario arrivava
    // a LIMIT/OFFSET: in entrambi i casi un throw al posto di `{ error }`
    // (regola 19), con l'error boundary al posto della pagina.
    describe("validazione runtime di status e paginazione", () => {
      const BIZ = "11111111-1111-4111-8111-111111111111";

      it.each([["PENDING"], ["DROP TABLE"], [42], [{}]])(
        "status %j non ammesso → { error } senza toccare il DB",
        async (status) => {
          const { searchReceipts } = await import("./storico-actions");
          const result = await searchReceipts(BIZ, { status } as never);

          expect(result.error).toBe("Filtro stato non valido.");
          expect(result.items).toEqual([]);
          expect(result.total).toBe(0);
          expect(mockSelect).not.toHaveBeenCalled();
        },
      );

      it.each([
        ["page", Number.NaN],
        ["page", Number.POSITIVE_INFINITY],
        ["page", 1.5],
        ["page", "2"],
        ["page", Number.MAX_VALUE],
        ["pageSize", Number.NaN],
        ["pageSize", Number.POSITIVE_INFINITY],
        ["pageSize", 2.5],
        ["pageSize", "10"],
      ])(
        "%s = %s non valido → { error } senza toccare il DB",
        async (key, v) => {
          const { searchReceipts } = await import("./storico-actions");
          const result = await searchReceipts(BIZ, { [key]: v } as never);

          expect(result.error).toBe("Paginazione non valida.");
          expect(result.total).toBe(0);
          expect(mockSelect).not.toHaveBeenCalled();
        },
      );

      it("page 0, negativa e pageSize fuori scala restano un clamp, non un errore", async () => {
        // Comportamento già in uso (client e test): non si rompe.
        const docsBuilder = makeDocsBuilder([]);
        mockSelect
          .mockReturnValueOnce(makeCountBuilder(0))
          .mockReturnValueOnce(docsBuilder);

        const { searchReceipts } = await import("./storico-actions");
        const result = await searchReceipts(BIZ, {
          page: -5,
          pageSize: 100000,
        });

        expect(result.error).toBeUndefined();
        expect(docsBuilder.offset).toHaveBeenCalledWith(0);
        expect(docsBuilder.limit).toHaveBeenCalledWith(expect.any(Number));
        expect(docsBuilder.limit.mock.calls[0][0]).toBeLessThanOrEqual(100);
      });

      it("status vuoto o null valgono come omesso, come prima (semantica di StatusFilter)", async () => {
        // "" = tutti gli stati nel tipo `StatusFilter`; null arriva da un
        // client che serializza il campo assente. Entrambi erano falsy.
        for (const status of ["", null]) {
          mockSelect.mockReset();
          mockSelect
            .mockReturnValueOnce(makeCountBuilder(0))
            .mockReturnValueOnce(makeDocsBuilder([]));
          const { searchReceipts } = await import("./storico-actions");
          const result = await searchReceipts(BIZ, { status } as never);
          expect(result.error).toBeUndefined();
        }
      });

      it("status ammessi (ACCEPTED, VOID_ACCEPTED) e omesso funzionano come prima", async () => {
        for (const status of [
          "ACCEPTED",
          "VOID_ACCEPTED",
          undefined,
        ] as const) {
          mockSelect.mockReset();
          mockSelect
            .mockReturnValueOnce(makeCountBuilder(0))
            .mockReturnValueOnce(makeDocsBuilder([]));
          const { searchReceipts } = await import("./storico-actions");
          const result = await searchReceipts(BIZ, { status });
          expect(result.error).toBeUndefined();
        }
      });
    });

    it("uses page 1 and default pageSize when not specified", async () => {
      const docsBuilder = makeDocsBuilder([FAKE_SALE_DOC]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(1))
        .mockReturnValueOnce(docsBuilder)
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { searchReceipts } = await import("./storico-actions");
      await searchReceipts("11111111-1111-4111-8111-111111111111");

      expect(docsBuilder.offset).toHaveBeenCalledWith(0); // page 1 → offset 0
    });

    it("returns correct total even when current page is empty (beyond last page)", async () => {
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(5))
        .mockReturnValueOnce(makeDocsBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const result = await searchReceipts(
        "11111111-1111-4111-8111-111111111111",
        { page: 3, pageSize: 10 },
      );

      // total is 5 even though page 3 has no items
      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(0);
      // Lines query not called when docs page is empty
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("ordina per ade_registered_at DESC con `id` come chiave secondaria stabile", async () => {
      const docsBuilder = makeDocsBuilder([]);
      mockSelect
        .mockReturnValueOnce(makeCountBuilder(0))
        .mockReturnValueOnce(docsBuilder);

      const { searchReceipts } = await import("./storico-actions");
      await searchReceipts("11111111-1111-4111-8111-111111111111");

      // Senza tiebreaker su `id` l'ordine fra righe con lo stesso
      // `ade_registered_at` non e' definito: pagina 1 e 2 possono ripetere o
      // saltare documenti.
      expect(docsBuilder.orderBy).toHaveBeenCalledWith(
        { _desc: "cd.ade_registered_at" },
        { _desc: "cd.id" },
      );
    });

    it("non ripete ne' perde documenti fra pagina 1 e 2 con ade_registered_at identici", async () => {
      // Fake DB che riordina liberamente le righe a parita' di chiave di
      // ordinamento (comportamento legittimo di Postgres) e diventa
      // deterministico solo quando l'ORDER BY include `id`.
      const SAME_INSTANT = new Date("2026-02-15T10:00:00Z");
      const all = Array.from({ length: 30 }, (_, i) => ({
        ...FAKE_SALE_DOC,
        id: `doc-${String(i).padStart(3, "0")}`,
        adeRegisteredAt: SAME_INSTANT,
      }));

      let queryIndex = 0;
      function makePagedBuilder() {
        let orderKeys: { _desc: string }[] = [];
        let pageSize = 10;
        const b = {
          from: vi.fn(),
          leftJoin: vi.fn(),
          where: vi.fn(),
          orderBy: vi.fn((...keys: { _desc: string }[]) => {
            orderKeys = keys;
            return b;
          }),
          limit: vi.fn((n: number) => {
            pageSize = n;
            return b;
          }),
          offset: vi.fn((off: number) => {
            const stable = orderKeys.some((k) => k._desc === "cd.id");
            const ordered = stable
              ? [...all].sort((x, y) => y.id.localeCompare(x.id))
              : (() => {
                  // Rotazione all'indietro: la finestra della pagina 2 scivola
                  // su righe gia' restituite nella pagina 1 → duplicati.
                  const shift =
                    (all.length - ((queryIndex * 7) % all.length)) % all.length;
                  return [...all.slice(shift), ...all.slice(0, shift)];
                })();
            queryIndex += 1;
            return Promise.resolve(ordered.slice(off, off + pageSize));
          }),
        };
        b.from.mockReturnValue(b);
        b.leftJoin.mockReturnValue(b);
        b.where.mockReturnValue(b);
        return b;
      }

      mockSelect
        .mockReturnValueOnce(makeCountBuilder(30))
        .mockReturnValueOnce(makePagedBuilder())
        .mockReturnValueOnce(makeLinesBuilder([]))
        .mockReturnValueOnce(makeReturnsBuilder([]))
        .mockReturnValueOnce(makeCountBuilder(30))
        .mockReturnValueOnce(makePagedBuilder())
        .mockReturnValueOnce(makeLinesBuilder([]));

      const { searchReceipts } = await import("./storico-actions");
      const biz = "11111111-1111-4111-8111-111111111111";
      const page1 = await searchReceipts(biz, { page: 1, pageSize: 10 });
      const page2 = await searchReceipts(biz, { page: 2, pageSize: 10 });

      const ids = [...page1.items, ...page2.items].map((i) => i.id);
      expect(ids).toHaveLength(20);
      expect(new Set(ids).size).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // getReceiptDetail — la rilettura che segue un annullo riuscito: senza,
  // riaprendo la modale la vendita risulta annullata ma priva di ricevuta di
  // annullamento e di stampa finche' l'utente non rifa' la ricerca.
  // -------------------------------------------------------------------------

  // Issue #1099: il collaboratore vede solo i documenti che ha creato, il
  // titolare tutta l'attività.
  describe("permessi del collaboratore", () => {
    const BIZ = "11111111-1111-4111-8111-111111111111";
    const DOC = "22222222-2222-4222-8222-222222222222";

    it("il titolare cerca in tutta l'attività", async () => {
      const countBuilder = makeCountBuilder(0);
      const docsBuilder = makeDocsBuilder([]);
      mockSelect
        .mockReturnValueOnce(countBuilder)
        .mockReturnValueOnce(docsBuilder);

      const { searchReceipts } = await import("./storico-actions");
      await searchReceipts(BIZ);

      expect(whereConditions(countBuilder)).not.toContainEqual(OWN_DOCUMENTS);
      expect(whereConditions(docsBuilder)).not.toContainEqual(OWN_DOCUMENTS);
    });

    it("il collaboratore cerca solo fra i propri documenti, conteggio compreso", async () => {
      mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR_MEMBERSHIP);
      const countBuilder = makeCountBuilder(0);
      const docsBuilder = makeDocsBuilder([]);
      mockSelect
        .mockReturnValueOnce(countBuilder)
        .mockReturnValueOnce(docsBuilder);

      const { searchReceipts } = await import("./storico-actions");
      await searchReceipts(BIZ);

      expect(whereConditions(countBuilder)).toContainEqual(OWN_DOCUMENTS);
      expect(whereConditions(docsBuilder)).toContainEqual(OWN_DOCUMENTS);
    });

    it("il collaboratore rilegge solo un documento suo", async () => {
      mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR_MEMBERSHIP);
      const detailBuilder = makeDetailBuilder([]);
      mockSelect.mockReturnValueOnce(detailBuilder);

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result).toEqual({ item: null });
      expect(whereConditions(detailBuilder)).toContainEqual(OWN_DOCUMENTS);
    });

    it("il titolare rilegge qualunque documento dell'attività", async () => {
      const detailBuilder = makeDetailBuilder([]);
      mockSelect.mockReturnValueOnce(detailBuilder);

      const { getReceiptDetail } = await import("./storico-actions");
      await getReceiptDetail(BIZ, DOC);

      expect(whereConditions(detailBuilder)).not.toContainEqual(OWN_DOCUMENTS);
    });
  });

  // issue #1099, decisione 2: il collaboratore rende qualunque vendita
  // dell'attività, trovata col numero stampato sullo scontrino e la data.
  describe("findSaleForReturn", () => {
    const BIZ = "11111111-1111-4111-8111-111111111111";
    // Il 15 febbraio italiano: dalla mezzanotte di Roma (23:00 UTC del 14)
    // alla mezzanotte successiva.
    const FROM = new Date("2026-02-14T23:00:00Z");
    const TO = new Date("2026-02-15T23:00:00Z");

    const find = async (number: string, date = "2026-02-15") => {
      const { findSaleForReturn } = await import("./storico-actions");
      return findSaleForReturn(BIZ, { number, date });
    };

    function queueSale(sale: Record<string, unknown> | null) {
      const detail = makeDetailBuilder(sale ? [sale] : []);
      mockSelect.mockReturnValueOnce(detail);
      // Le righe si leggono solo per una vendita accettata: accodarle sempre
      // le lascerebbe al test successivo.
      if (sale?.status === "ACCEPTED") {
        mockSelect.mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));
      }
      return detail;
    }

    it("trova la vendita col numero completo e la data", async () => {
      const detail = queueSale(FAKE_SALE_DOC);

      const result = await find("DCW2026/5111-2188");

      expect(result).toEqual({
        item: expect.objectContaining({
          id: "sale-doc-uuid",
          adeProgressive: "DCW2026/5111-2188",
        }),
      });
      expect(whereConditions(detail)).toEqual([
        { _eq: ["cd.business_id", BIZ] },
        { _eq: ["cd.kind", "SALE"] },
        { _like: ["cd.ade_progressive", "%/5111-2188"] },
        { _gte: ["cd.ade_registered_at", FROM] },
        { _lt: ["cd.ade_registered_at", TO] },
      ]);
    });

    it.each(["5111-2188", " dcw2026/5111-2188 ", "DCW2026/5111-2188\n"])(
      "accetta anche %j: il numero dopo la barra, minuscole e spazi",
      async (number) => {
        const detail = queueSale(FAKE_SALE_DOC);

        await find(number);

        expect(whereConditions(detail)).toContainEqual({
          _like: ["cd.ade_progressive", "%/5111-2188"],
        });
      },
    );

    it("accetta il numero del mock AdE di dev e sandbox", async () => {
      const detail = queueSale({
        ...FAKE_SALE_DOC,
        adeProgressive: "DCW2026/MOCK-12",
      });

      await find("DCW2026/MOCK-12");

      expect(whereConditions(detail)).toContainEqual({
        _like: ["cd.ade_progressive", "%/MOCK-12"],
      });
    });

    it.each(["", "5111", "DCW2026/", "51%-2188", "DCW2026/5111-2188/1"])(
      "rifiuta il numero %j senza interrogare il DB",
      async (number) => {
        const result = await find(number);

        expect(result).toEqual({ error: expect.stringMatching(/numero/i) });
        expect(mockSelect).not.toHaveBeenCalled();
      },
    );

    it("rifiuta una data non valida senza interrogare il DB", async () => {
      const result = await find("5111-2188", "15/02/2026");

      expect(result).toEqual({ error: expect.stringMatching(/data/i) });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("dice che non c'è nessuna vendita con quel numero quel giorno", async () => {
      queueSale(null);

      await expect(find("5111-2188")).resolves.toEqual({
        error: "Nessuno scontrino con questo numero in questa data.",
      });
    });

    it("una vendita annullata non si rende, e lo dice", async () => {
      queueSale({ ...FAKE_SALE_DOC, status: "VOID_ACCEPTED" });

      await expect(find("5111-2188")).resolves.toEqual({
        error: "Questo scontrino è stato annullato: non si può fare il reso.",
      });
    });

    it.each(["PENDING", "ERROR", "REJECTED"])(
      "una vendita %s risponde come una che non c'è",
      async (status) => {
        queueSale({ ...FAKE_SALE_DOC, status });

        await expect(find("5111-2188")).resolves.toEqual({
          error: "Nessuno scontrino con questo numero in questa data.",
        });
      },
    );

    it("il collaboratore trova anche la vendita di un altro membro", async () => {
      mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR_MEMBERSHIP);
      mockGetPlanSafe.mockResolvedValue({
        ok: true,
        info: { plan: "team", trialStartedAt: null, planExpiresAt: null },
      });
      const detail = queueSale(FAKE_SALE_DOC);

      const result = await find("5111-2188");

      expect(result).toHaveProperty("item");
      expect(whereConditions(detail)).not.toContainEqual(OWN_DOCUMENTS);
    });

    it("il collaboratore sospeso non cerca: il reso non lo potrebbe fare", async () => {
      mockCheckBusinessMembership.mockResolvedValue(COLLABORATOR_MEMBERSHIP);
      mockGetPlanSafe.mockResolvedValue({
        ok: true,
        info: { plan: "pro", trialStartedAt: null, planExpiresAt: null },
      });
      const { COLLABORATORS_SUSPENDED_MESSAGE } =
        await import("@/lib/business-permissions");

      await expect(find("5111-2188")).resolves.toEqual({
        error: COLLABORATORS_SUSPENDED_MESSAGE,
      });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("per il titolare non legge il piano", async () => {
      queueSale(FAKE_SALE_DOC);

      await find("5111-2188");

      expect(mockGetPlanSafe).not.toHaveBeenCalled();
    });

    it("chi non è membro dell'attività non cerca", async () => {
      mockCheckBusinessMembership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      await expect(find("5111-2188")).resolves.toEqual({
        error: "Business non trovato o non autorizzato.",
      });
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("oltre 30 ricerche in un'ora si ferma", async () => {
      mockGetAuthenticatedUser.mockResolvedValue({ id: "user-rate-limited" });
      for (let i = 0; i < 30; i++) await find("non-un-numero");

      await expect(find("5111-2188")).resolves.toEqual({
        error: "Troppe ricerche ravvicinate. Riprova tra qualche minuto.",
      });
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  describe("getReceiptDetail", () => {
    const BIZ = "11111111-1111-4111-8111-111111111111";
    const DOC = "22222222-2222-4222-8222-222222222222";

    it("espone l'annullo appena collegato alla vendita", async () => {
      mockSelect
        .mockReturnValueOnce(
          makeDetailBuilder([
            {
              ...FAKE_SALE_DOC,
              id: DOC,
              status: "VOID_ACCEPTED",
              voidDocumentId: "void-doc-uuid",
              voidAdeProgressive: "DCW2026/5111-2189",
              voidAdeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
            },
          ]),
        )
        .mockReturnValueOnce(makeLinesBuilder(FAKE_DOC_LINES));

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result.item?.status).toBe("VOID_ACCEPTED");
      expect(result.item?.voidDocument).toEqual({
        id: "void-doc-uuid",
        adeProgressive: "DCW2026/5111-2189",
        adeRegisteredAt: new Date("2026-02-16T09:15:00Z"),
      });
    });

    it("restituisce la stessa forma di una riga dell'elenco (righe e totale)", async () => {
      mockSelect
        .mockReturnValueOnce(makeDetailBuilder([{ ...FAKE_SALE_DOC, id: DOC }]))
        .mockReturnValueOnce(
          makeLinesBuilder(
            FAKE_DOC_LINES.map((l) => ({ ...l, documentId: DOC })),
          ),
        );

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result.item?.total).toBe("10.00");
      expect(result.item?.lines).toEqual([
        {
          description: "Pizza",
          quantity: "2.000",
          grossUnitPrice: "5.00",
          vatCode: "10",
          returnedQuantity: "0",
        },
      ]);
      expect(result.item?.voidDocument).toBeNull();
      expect(result.item?.returnOf).toBeNull();
    });

    it("restituisce item null quando il documento non esiste", async () => {
      mockSelect.mockReturnValueOnce(makeDetailBuilder([]));

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result.item).toBeNull();
      // Nessuna query righe su un documento inesistente
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("degrada a 'Non autenticato.' quando la sessione è scaduta (regola 19/20)", async () => {
      mockGetAuthenticatedUser.mockRejectedValue(new UnauthenticatedError());

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result.error).toBe("Non autenticato.");
      expect(result.item).toBeNull();
      expect(mockCheckBusinessMembership).not.toHaveBeenCalled();
    });

    it("guard UUID (regola 9): documentId malformato → error envelope senza query", async () => {
      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, "non-un-uuid");

      expect(result.error).toBe("Identificativo non valido.");
      expect(result.item).toBeNull();
      expect(mockCheckBusinessMembership).not.toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("non serve il documento di un altro business (ownership)", async () => {
      mockCheckBusinessMembership.mockResolvedValue({
        error: "Business non trovato o non autorizzato.",
      });

      const { getReceiptDetail } = await import("./storico-actions");
      const result = await getReceiptDetail(BIZ, DOC);

      expect(result.error).toBe("Business non trovato o non autorizzato.");
      expect(result.item).toBeNull();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });
});
