// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted before all imports) ─────────────────────────────────────

const {
  mockResolve4,
  mockResolve6,
  mockSqlTag,
  mockSqlEnd,
  mockSqlBegin,
  mockSqlUnsafe,
  mockReaddir,
  mockReadFile,
  mockConsoleWarn,
} = vi.hoisted(() => {
  // Set DATABASE_URL here so it's available when the module auto-executes on import
  process.env.DATABASE_URL =
    "postgresql://user:pass@db.example.supabase.co:5432/postgres";

  const mockSqlUnsafe = vi.fn().mockResolvedValue(undefined);
  const mockSqlEnd = vi.fn().mockResolvedValue(undefined);
  const mockSqlTag = vi.fn().mockResolvedValue([]);
  const mockSqlBegin = vi
    .fn()
    .mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) =>
      fn(mockTx),
    );
  const mockTx = Object.assign(vi.fn().mockResolvedValue(undefined), {
    unsafe: mockSqlUnsafe,
  });

  return {
    mockResolve4: vi.fn().mockResolvedValue(["1.2.3.4"]),
    mockResolve6: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("ENODATA"), { code: "ENODATA" }),
      ),
    mockSqlTag,
    mockSqlEnd,
    mockSqlBegin,
    mockSqlUnsafe,
    mockReaddir: vi.fn().mockResolvedValue([]),
    mockReadFile: vi.fn().mockResolvedValue("-- sql content"),
    mockConsoleWarn: vi.fn(),
  };
});

vi.mock("dns/promises", () => ({
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

vi.mock("fs/promises", () => ({
  readdir: mockReaddir,
  readFile: mockReadFile,
}));

vi.mock("postgres", () => ({
  default: vi.fn().mockImplementation(function () {
    return Object.assign(mockSqlTag, {
      begin: mockSqlBegin,
      end: mockSqlEnd,
    });
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toIPv4Url, runMigrations } from "../../scripts/migrate";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("toIPv4Url()", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(mockConsoleWarn);
    mockResolve4.mockReset();
    mockResolve6.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockConsoleWarn.mockReset();
  });

  it("sostituisce il hostname con l'IP IPv4 quando resolve4 ha successo", async () => {
    mockResolve4.mockResolvedValue(["1.2.3.4"]);

    const result = await toIPv4Url(
      "postgresql://user:pass@db.hjvxupqrlummlcoruoaj.supabase.co:5432/postgres",
    );

    expect(result).toContain("1.2.3.4");
    expect(result).not.toContain("db.hjvxupqrlummlcoruoaj.supabase.co");
  });

  it("preserva le credenziali, la porta e il path nell'URL risultante", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.1"]);

    const result = await toIPv4Url(
      "postgresql://myuser:mypass@host.example.com:5432/mydb",
    );

    expect(result).toContain("myuser");
    expect(result).toContain("mypass");
    expect(result).toContain(":5432");
    expect(result).toContain("/mydb");
    expect(result).toContain("10.0.0.1");
  });

  it("lancia un errore con guidance quando il host è IPv6-only (ENODATA su A, successo su AAAA)", async () => {
    mockResolve4.mockRejectedValue(
      Object.assign(new Error("ENODATA"), { code: "ENODATA" }),
    );
    mockResolve6.mockResolvedValue(["2a05:d018::1"]);

    await expect(
      toIPv4Url("postgresql://user:pass@ipv6only.supabase.co:5432/postgres"),
    ).rejects.toThrow("only has IPv6");
  });

  it("il messaggio di errore IPv6-only contiene il nome del host e il suggerimento Session Pooler", async () => {
    mockResolve4.mockRejectedValue(
      Object.assign(new Error("ENODATA"), { code: "ENODATA" }),
    );
    mockResolve6.mockResolvedValue(["2a05:d018::1"]);

    await expect(
      toIPv4Url(
        "postgresql://user:pass@db.hjvxupqrlummlcoruoaj.supabase.co:5432/postgres",
      ),
    ).rejects.toThrow("Session pooler");
  });

  it("ritorna l'URL originale e logga warning quando sia resolve4 che resolve6 falliscono (host sconosciuto)", async () => {
    mockResolve4.mockRejectedValue(
      Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
    );
    mockResolve6.mockRejectedValue(
      Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
    );
    const original = "postgresql://user:pass@unknown.host.com:5432/postgres";

    const result = await toIPv4Url(original);

    expect(result).toBe(original);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("DNS resolution failed"),
    );
  });
});

describe("runMigrations()", () => {
  const originalDirect = process.env.DATABASE_URL_DIRECT;
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve4.mockResolvedValue(["1.2.3.4"]);
    mockSqlEnd.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockResolvedValue("-- sql content");
    // Default: CREATE TABLE and SELECT both return [] (no applied migrations)
    mockSqlTag.mockResolvedValue([]);
    mockSqlBegin.mockImplementation(
      async (fn: (tx: { unsafe: typeof mockSqlUnsafe }) => Promise<void>) => {
        const tx = Object.assign(vi.fn().mockResolvedValue(undefined), {
          unsafe: mockSqlUnsafe,
        });
        return fn(tx);
      },
    );
  });

  afterEach(() => {
    if (originalDirect === undefined) {
      delete process.env.DATABASE_URL_DIRECT;
    } else {
      process.env.DATABASE_URL_DIRECT = originalDirect;
    }
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
    delete process.env.SKIP_MIGRATIONS;
    vi.clearAllMocks();
  });

  it("salta le migrazioni e non si connette al DB quando SKIP_MIGRATIONS=true", async () => {
    process.env.SKIP_MIGRATIONS = "true";

    await runMigrations();

    expect(mockSqlTag).not.toHaveBeenCalled();
    expect(mockSqlEnd).not.toHaveBeenCalled();
  });

  it("lancia un errore se mancano sia DATABASE_URL_DIRECT che DATABASE_URL", async () => {
    delete process.env.DATABASE_URL_DIRECT;
    delete process.env.DATABASE_URL;

    await expect(runMigrations()).rejects.toThrow(
      "DATABASE_URL_DIRECT or DATABASE_URL must be set",
    );
  });

  it("preferisce DATABASE_URL_DIRECT rispetto a DATABASE_URL se entrambi presenti", async () => {
    process.env.DATABASE_URL_DIRECT =
      "postgresql://direct:pass@direct.host.com:5432/db";
    process.env.DATABASE_URL =
      "postgresql://pooler:pass@pooler.host.com:5432/db";

    await runMigrations();

    expect(mockResolve4).toHaveBeenCalledWith("direct.host.com");
  });

  it("usa DATABASE_URL quando DATABASE_URL_DIRECT non è impostato", async () => {
    delete process.env.DATABASE_URL_DIRECT;
    process.env.DATABASE_URL = "postgresql://user:pass@pooler.host.com:5432/db";

    await runMigrations();

    expect(mockSqlEnd).toHaveBeenCalled();
  });

  it("chiude la connessione dopo le migrazioni", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host.example.com:5432/db";

    await runMigrations();

    expect(mockSqlEnd).toHaveBeenCalled();
  });

  it("applica solo le migrazioni non ancora applicate", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host.example.com:5432/db";
    mockReaddir.mockResolvedValue([
      { name: "0001_init.sql", isFile: () => true },
      { name: "0002_add_column.sql", isFile: () => true },
    ]);
    // 0001 already applied
    mockSqlTag
      .mockResolvedValueOnce(undefined) // CREATE TABLE
      .mockResolvedValueOnce([{ filename: "0001_init.sql" }]); // SELECT

    await runMigrations();

    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining("0002_add_column.sql"),
      "utf-8",
    );
    expect(mockSqlBegin).toHaveBeenCalledTimes(1);
  });

  it("non applica nessuna migrazione se tutte sono già state applicate", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host.example.com:5432/db";
    mockReaddir.mockResolvedValue([
      { name: "0001_init.sql", isFile: () => true },
    ]);
    mockSqlTag
      .mockResolvedValueOnce(undefined) // CREATE TABLE
      .mockResolvedValueOnce([{ filename: "0001_init.sql" }]); // SELECT

    await runMigrations();

    expect(mockSqlBegin).not.toHaveBeenCalled();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("chiude la connessione anche in caso di errore durante una migrazione", async () => {
    process.env.DATABASE_URL =
      "postgresql://user:pass@host.example.com:5432/db";
    mockReaddir.mockResolvedValue([
      { name: "0001_init.sql", isFile: () => true },
    ]);
    mockSqlBegin.mockRejectedValueOnce(new Error("TX failed"));

    await expect(runMigrations()).rejects.toThrow("TX failed");

    expect(mockSqlEnd).toHaveBeenCalled();
  });
});
