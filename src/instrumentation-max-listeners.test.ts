import { EventEmitter } from "node:events";
import { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertIdentityEnv = vi.fn();
vi.mock("@/lib/identity-env", () => ({
  assertIdentityEnv: mockAssertIdentityEnv,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

/**
 * `setMaxListeners` scrive `_maxListeners` sull'oggetto su cui è chiamato: sul
 * prototype significa "default per tutte le ServerResponse". Il valore va
 * ripristinato dopo ogni test, altrimenti il primo `register()` lo lascia
 * alzato per l'intero file di suite.
 */
function readPrototypeMaxListeners(): number | undefined {
  return (ServerResponse.prototype as unknown as { _maxListeners?: number })
    ._maxListeners;
}

function restorePrototypeMaxListeners(value: number | undefined): void {
  (
    ServerResponse.prototype as unknown as { _maxListeners?: number }
  )._maxListeners = value;
}

describe("raiseServerResponseMaxListeners()", () => {
  let originalMaxListeners: number | undefined;
  let originalNextRuntime: string | undefined;

  beforeEach(() => {
    originalMaxListeners = readPrototypeMaxListeners();
    originalNextRuntime = process.env.NEXT_RUNTIME;
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(global, "setInterval").mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setInterval>);
    vi.spyOn(global, "setTimeout").mockReturnValue({
      unref: vi.fn(),
    } as unknown as ReturnType<typeof setTimeout>);
  });

  afterEach(() => {
    restorePrototypeMaxListeners(originalMaxListeners);
    vi.restoreAllMocks();
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime;
    }
  });

  it("alza il tetto dei listener sulle ServerResponse create dopo la chiamata", async () => {
    const { raiseServerResponseMaxListeners, SERVER_RESPONSE_MAX_LISTENERS } =
      await import("./instrumentation");

    await raiseServerResponseMaxListeners();

    const res = new ServerResponse({} as never);
    expect(res.getMaxListeners()).toBe(SERVER_RESPONSE_MAX_LISTENERS);
  });

  it("il tetto è sopra il picco misurato di 11 listener close per risposta", async () => {
    const { SERVER_RESPONSE_MAX_LISTENERS } = await import("./instrumentation");

    expect(SERVER_RESPONSE_MAX_LISTENERS).toBeGreaterThan(11);
  });

  it("è idempotente: due chiamate lasciano lo stesso tetto", async () => {
    const { raiseServerResponseMaxListeners, SERVER_RESPONSE_MAX_LISTENERS } =
      await import("./instrumentation");

    await raiseServerResponseMaxListeners();
    await raiseServerResponseMaxListeners();

    expect(new ServerResponse({} as never).getMaxListeners()).toBe(
      SERVER_RESPONSE_MAX_LISTENERS,
    );
  });

  it("NON tocca il default globale degli altri EventEmitter", async () => {
    const { raiseServerResponseMaxListeners } =
      await import("./instrumentation");
    const before = EventEmitter.defaultMaxListeners;

    await raiseServerResponseMaxListeners();

    expect(EventEmitter.defaultMaxListeners).toBe(before);
    expect(new EventEmitter().getMaxListeners()).toBe(before);
  });

  it("register() lo applica nel runtime nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register, SERVER_RESPONSE_MAX_LISTENERS } =
      await import("./instrumentation");

    await register();

    expect(new ServerResponse({} as never).getMaxListeners()).toBe(
      SERVER_RESPONSE_MAX_LISTENERS,
    );
  });

  it("register() NON lo applica nel runtime edge (node:http non esiste lì)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    restorePrototypeMaxListeners(undefined);
    const { register } = await import("./instrumentation");

    await register();

    expect(readPrototypeMaxListeners()).toBeUndefined();
  });
});
