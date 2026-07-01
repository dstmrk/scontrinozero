import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// NB: register() non fa più lavoro DB al boot. Le migrazioni le applica
// `migrate.js` (processo separato del Dockerfile) e il backfill una-tantum di
// `trial_vat_ledger` è stato rimosso una volta seedato il ledger. Niente mock di
// postgres / drizzle / dns qui.

const mockAssertIdentityEnv = vi.fn();
vi.mock("@/lib/identity-env", () => ({
  assertIdentityEnv: mockAssertIdentityEnv,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Il keep-alive Supabase è dentro lo stesso register() (REVIEW.md #29): va
// mockato @/lib/supabase/admin e intercettato setInterval, altrimenti register()
// in nodejs lascerebbe un timer reale al termine dei test.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

describe("instrumentation register()", () => {
  let originalNextRuntime: string | undefined;

  beforeEach(() => {
    originalNextRuntime = process.env.NEXT_RUNTIME;
    // resetModules: il keep-alive ha una guardia di idempotenza module-level
    // (keepAliveStarted) — senza reset, dopo il primo register() nodejs gli
    // altri test non vedrebbero più setInterval chiamato.
    vi.resetModules();
    vi.clearAllMocks();
    // Intercetta setInterval per non lasciare timer reali e per asserire il keep-alive.
    vi.spyOn(global, "setInterval").mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setInterval>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime;
    }
    delete process.env.INACTIVE_USER_PRUNE_ENABLED;
  });

  it("does nothing when NEXT_RUNTIME is not 'nodejs'", async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import("./instrumentation");

    await register();

    expect(mockAssertIdentityEnv).not.toHaveBeenCalled();
    expect(global.setInterval).not.toHaveBeenCalled();
  });

  it("R24: chiama assertIdentityEnv come prima istruzione nel runtime nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("./instrumentation");

    await register();

    expect(mockAssertIdentityEnv).toHaveBeenCalledOnce();
    // Deve essere chiamato PRIMA del keep-alive (un container con env malformate
    // deve crashare al boot, non lasciare un timer attivo).
    const assertOrder = mockAssertIdentityEnv.mock.invocationCallOrder[0]!;
    const setIntervalOrder = vi.mocked(global.setInterval).mock
      .invocationCallOrder[0]!;
    expect(assertOrder).toBeLessThan(setIntervalOrder);
  });

  it("R24: register propaga il throw di assertIdentityEnv (container non parte in prod)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    mockAssertIdentityEnv.mockImplementationOnce(() => {
      throw new Error("identity env validation failed at boot");
    });
    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow(
      /identity env validation failed at boot/,
    );
    // Il keep-alive non deve partire quando l'identità è rotta.
    expect(global.setInterval).not.toHaveBeenCalled();
  });

  it("R24: NON chiama assertIdentityEnv quando NEXT_RUNTIME non e' nodejs", async () => {
    delete process.env.NEXT_RUNTIME;
    const { register } = await import("./instrumentation");

    await register();

    expect(mockAssertIdentityEnv).not.toHaveBeenCalled();
  });

  it("avvia il keep-alive Supabase nel ramo nodejs (REVIEW.md #29)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("./instrumentation");

    await register();

    // Both the Supabase keep-alive and the Stripe webhook claim sweep
    // (REVIEW.md #20) start an unref'd setInterval in the nodejs branch.
    expect(global.setInterval).toHaveBeenCalledTimes(2);
  });

  it("avvia anche il prune sweep GDPR quando INACTIVE_USER_PRUNE_ENABLED=true", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.INACTIVE_USER_PRUNE_ENABLED = "true";
    const { register } = await import("./instrumentation");

    await register();

    // keep-alive + webhook claim sweep + prune sweep GDPR = 3 timer.
    expect(global.setInterval).toHaveBeenCalledTimes(3);
  });

  it("NON avvia il prune sweep GDPR quando la feature è disabilitata (default)", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.INACTIVE_USER_PRUNE_ENABLED;
    const { register } = await import("./instrumentation");

    await register();

    // Solo keep-alive + webhook claim sweep: il prune non parte.
    expect(global.setInterval).toHaveBeenCalledTimes(2);
  });

  it("NON avvia il keep-alive quando NEXT_RUNTIME=edge", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("./instrumentation");

    await register();

    expect(global.setInterval).not.toHaveBeenCalled();
  });
});
