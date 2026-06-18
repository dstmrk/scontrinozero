import { describe, expect, it, vi, beforeEach } from "vitest";
import { backfillTrialVatLedgerIfEmpty } from "./backfill-trial-vat-ledger";

vi.mock("@/db/schema", () => ({
  profiles: { partitaIva: "profiles.partita_iva" },
  trialVatLedger: { id: "trial_vat_ledger.id" },
}));

vi.mock("@/lib/piva-hash", () => ({
  hashPiva: (piva: string) => `hash-${piva}`,
}));

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

// drizzle-orm operators: identità sufficiente per i test (non eseguiamo SQL).
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  isNotNull: (col: unknown) => ({ isNotNull: col }),
  ne: (col: unknown, val: unknown) => ({ ne: [col, val] }),
}));

type DbMock = ReturnType<typeof makeDb>;

function makeDb(opts: {
  ledgerRows: { id: string }[];
  profileRows: { partitaIva: string | null }[];
}) {
  const ledgerLimit = vi.fn().mockResolvedValue(opts.ledgerRows);
  const profilesWhere = vi.fn().mockResolvedValue(opts.profileRows);
  const from = vi.fn().mockReturnValue({
    limit: ledgerLimit,
    where: profilesWhere,
  });
  const select = vi.fn().mockReturnValue({ from });

  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });

  return {
    select,
    insert,
    // exposed mocks for assertions
    _ledgerLimit: ledgerLimit,
    _profilesWhere: profilesWhere,
    _values: values,
    _onConflictDoNothing: onConflictDoNothing,
  };
}

// Cast helper: la firma richiede un PostgresJsDatabase, ma nei test passiamo il
// mock strutturale.
function asDb(db: DbMock) {
  return db as unknown as Parameters<typeof backfillTrialVatLedgerIfEmpty>[0];
}

describe("backfillTrialVatLedgerIfEmpty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-op se il ledger ha già righe (non legge profiles, non inserisce)", async () => {
    const db = makeDb({
      ledgerRows: [{ id: "existing" }],
      profileRows: [{ partitaIva: "12345678901" }],
    });

    const result = await backfillTrialVatLedgerIfEmpty(asDb(db));

    expect(result).toEqual({ skipped: true, inserted: 0 });
    expect(db._profilesWhere).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserisce gli hash delle P.IVA pregresse quando il ledger è vuoto", async () => {
    const db = makeDb({
      ledgerRows: [],
      profileRows: [
        { partitaIva: "12345678901" },
        { partitaIva: "10987654321" },
      ],
    });

    const result = await backfillTrialVatLedgerIfEmpty(asDb(db));

    expect(result).toEqual({ skipped: false, inserted: 2 });
    expect(db._values).toHaveBeenCalledWith([
      { pivaHash: "hash-12345678901" },
      { pivaHash: "hash-10987654321" },
    ]);
    expect(db._onConflictDoNothing).toHaveBeenCalled();
  });

  it("deduplica gli hash quando profiles contiene la stessa P.IVA più volte", async () => {
    const db = makeDb({
      ledgerRows: [],
      profileRows: [
        { partitaIva: "12345678901" },
        { partitaIva: "12345678901" },
      ],
    });

    const result = await backfillTrialVatLedgerIfEmpty(asDb(db));

    expect(result.inserted).toBe(1);
    expect(db._values).toHaveBeenCalledWith([{ pivaHash: "hash-12345678901" }]);
  });

  it("non inserisce nulla se non ci sono P.IVA pregresse", async () => {
    const db = makeDb({ ledgerRows: [], profileRows: [] });

    const result = await backfillTrialVatLedgerIfEmpty(asDb(db));

    expect(result).toEqual({ skipped: false, inserted: 0 });
    expect(db.insert).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("nessuna P.IVA pregressa"),
    );
  });
});
