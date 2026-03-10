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
});
