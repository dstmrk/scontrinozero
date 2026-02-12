import { afterEach, describe, expect, it, vi } from "vitest";

describe("db initialization", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    if (typeof originalDatabaseUrl === "string") {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("does not throw on import when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("./index")).resolves.toBeDefined();
  });

  it("throws when getDb is called and DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    const dbModule = await import("./index");

    expect(() => dbModule.getDb()).toThrow(
      "DATABASE_URL environment variable is required.",
    );
  });

  it("creates postgres client and drizzle db when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/app";

    const postgresClient = Symbol("postgres-client");
    const drizzleDb = Symbol("drizzle-db");

    const postgres = vi.fn().mockReturnValue(postgresClient);
    const drizzle = vi.fn().mockReturnValue(drizzleDb);
    const schema = { waitlist: Symbol("waitlist") };

    vi.doMock("postgres", () => ({ default: postgres }));
    vi.doMock("drizzle-orm/postgres-js", () => ({ drizzle }));
    vi.doMock("./schema", () => schema);

    const dbModule = await import("./index");

    expect(dbModule.getDb()).toBe(drizzleDb);
    expect(postgres).toHaveBeenCalledWith(process.env.DATABASE_URL, {
      prepare: false,
    });
    expect(drizzle).toHaveBeenCalledWith({
      client: postgresClient,
      schema,
    });
  });

  it("returns cached db instance on subsequent getDb calls", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/app";

    const postgresClient = Symbol("postgres-client");
    const drizzleDb = Symbol("drizzle-db");

    const postgres = vi.fn().mockReturnValue(postgresClient);
    const drizzle = vi.fn().mockReturnValue(drizzleDb);

    vi.doMock("postgres", () => ({ default: postgres }));
    vi.doMock("drizzle-orm/postgres-js", () => ({ drizzle }));

    const dbModule = await import("./index");

    const first = dbModule.getDb();
    const second = dbModule.getDb();

    expect(first).toBe(second);
    expect(postgres).toHaveBeenCalledTimes(1);
    expect(drizzle).toHaveBeenCalledTimes(1);
  });
});
