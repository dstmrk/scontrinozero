import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockMigrate = vi.fn();
const mockClientEnd = vi.fn();
const mockClient = { end: mockClientEnd };
const mockPostgresDefault = vi.fn(() => mockClient);
const mockDb = {};
const mockDrizzleFn = vi.fn(() => mockDb);

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: mockMigrate,
}));

vi.mock("postgres", () => ({
  default: mockPostgresDefault,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mockDrizzleFn,
}));

// resolve4 returns the hostname as-is so the URL host is predictable in tests
vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn((hostname: string) => Promise.resolve([hostname])),
}));

const mockAssertIdentityEnv = vi.fn();
vi.mock("@/lib/identity-env", () => ({
  assertIdentityEnv: mockAssertIdentityEnv,
}));

const mockBackfill = vi.fn();
vi.mock("@/lib/backfill-trial-vat-ledger", () => ({
  backfillTrialVatLedgerIfEmpty: mockBackfill,
}));

const mockLoggerError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

describe("instrumentation register()", () => {
  let originalNextRuntime: string | undefined;
  let originalDbUrl: string | undefined;
  let originalDbUrlDirect: string | undefined;

  beforeEach(() => {
    originalNextRuntime = process.env.NEXT_RUNTIME;
    originalDbUrl = process.env.DATABASE_URL;
    originalDbUrlDirect = process.env.DATABASE_URL_DIRECT;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime;
    }
    if (originalDbUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDbUrl;
    }
    if (originalDbUrlDirect === undefined) {
      delete process.env.DATABASE_URL_DIRECT;
    } else {
      process.env.DATABASE_URL_DIRECT = originalDbUrlDirect;
    }
  });

  it("does nothing when NEXT_RUNTIME is not 'nodejs'", async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import("./instrumentation");

    await register();

    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it("throws when neither DATABASE_URL_DIRECT nor DATABASE_URL is set", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_DIRECT;
    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow(
      "DATABASE_URL_DIRECT or DATABASE_URL is required to run migrations",
    );
  });

  it("prefers DATABASE_URL_DIRECT over DATABASE_URL", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL_DIRECT = "postgres://direct";
    process.env.DATABASE_URL = "postgres://pooler";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockPostgresDefault).toHaveBeenCalledWith(
      "postgres://direct",
      expect.any(Object),
    );
  });

  it("falls back to DATABASE_URL when DATABASE_URL_DIRECT is not set", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.DATABASE_URL_DIRECT;
    process.env.DATABASE_URL = "postgres://pooler";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockPostgresDefault).toHaveBeenCalledWith(
      "postgres://pooler",
      expect.any(Object),
    );
  });

  it("calls migrate with the correct migrations folder", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
      migrationsFolder: "./supabase/migrations",
    });
  });

  it("closes the DB connection after migration completes", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockClientEnd).toHaveBeenCalled();
  });

  it("esegue il backfill del ledger anti-frode dopo migrate e prima di chiudere la connessione", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockBackfill).toHaveBeenCalledWith(mockDb);
    const migrateOrder = mockMigrate.mock.invocationCallOrder[0]!;
    const backfillOrder = mockBackfill.mock.invocationCallOrder[0]!;
    const endOrder = mockClientEnd.mock.invocationCallOrder[0]!;
    expect(migrateOrder).toBeLessThan(backfillOrder);
    expect(backfillOrder).toBeLessThan(endOrder);
  });

  it("non blocca l'avvio se il backfill fallisce (degrada, regola 19)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    mockBackfill.mockRejectedValueOnce(new Error("backfill boom"));
    const { register } = await import("./instrumentation");

    await expect(register()).resolves.toBeUndefined();
    // La connessione viene comunque chiusa e l'errore è loggato.
    expect(mockClientEnd).toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ critical: true }),
      expect.stringContaining("backfill trial_vat_ledger fallito"),
    );
  });

  it("R24: chiama assertIdentityEnv come prima istruzione nel runtime nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockAssertIdentityEnv).toHaveBeenCalledOnce();
    // Deve essere chiamato PRIMA del migrate (altrimenti un container con
    // env malformate fa lavorare il pool DB inutilmente prima di crashare).
    const assertOrder = mockAssertIdentityEnv.mock.invocationCallOrder[0]!;
    const postgresOrder = mockPostgresDefault.mock.invocationCallOrder[0]!;
    expect(assertOrder).toBeLessThan(postgresOrder);
  });

  it("R24: register propaga il throw di assertIdentityEnv (container non parte in prod)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.DATABASE_URL = "postgres://test";
    mockAssertIdentityEnv.mockImplementationOnce(() => {
      throw new Error("identity env validation failed at boot");
    });
    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow(
      /identity env validation failed at boot/,
    );
    // Migrate non deve essere eseguito quando l'identita' e' rotta.
    expect(mockMigrate).not.toHaveBeenCalled();
    expect(mockPostgresDefault).not.toHaveBeenCalled();
  });

  it("R24: NON chiama assertIdentityEnv quando NEXT_RUNTIME non e' nodejs", async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import("./instrumentation");

    await register();

    expect(mockAssertIdentityEnv).not.toHaveBeenCalled();
  });
});
