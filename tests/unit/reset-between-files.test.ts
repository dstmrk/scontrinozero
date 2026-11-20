// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processSingleton } from "@/lib/process-singleton";
import { resetSharedStateBetweenFiles } from "../reset-between-files";

/**
 * Con `isolate: false` questo reset è l'unica cosa che separa un file di test
 * dal successivo nello stesso worker. Ogni caso qui è uno stato che, prima,
 * un file lasciava al vicino.
 */
describe("resetSharedStateBetweenFiles", () => {
  it("ripristina le env stubbate", () => {
    const before = process.env.RESET_PROBE_ENV;
    vi.stubEnv("RESET_PROBE_ENV", "stubbed");

    resetSharedStateBetweenFiles();

    expect(process.env.RESET_PROBE_ENV).toBe(before);
  });

  it("ripristina l'env assegnato a mano, non solo quello di vi.stubEnv", () => {
    const before = process.env.NODE_ENV;
    process.env.RESET_PROBE_ASSIGNED = "leaked";
    (process.env as Record<string, string>).NODE_ENV = "leaked";

    resetSharedStateBetweenFiles();

    expect("RESET_PROBE_ASSIGNED" in process.env).toBe(false);
    expect(process.env.NODE_ENV).toBe(before);
  });

  it("riporta l'env anche a una chiave cancellata dal file", () => {
    const before = process.env.PATH;
    delete process.env.PATH;

    resetSharedStateBetweenFiles();

    expect(process.env.PATH).toBe(before);
  });

  it("ripristina i globali stubbati", () => {
    vi.stubGlobal("resetProbeGlobal", "stubbed");

    resetSharedStateBetweenFiles();

    expect("resetProbeGlobal" in globalThis).toBe(false);
  });

  it("torna ai timer reali", () => {
    vi.useFakeTimers();

    resetSharedStateBetweenFiles();

    expect(vi.isFakeTimers()).toBe(false);
  });

  it("scarta i processSingleton: il file dopo ne costruisce uno suo", () => {
    const first = processSingleton("resetProbe", () => ({ owner: "file A" }));

    resetSharedStateBetweenFiles();

    const second = processSingleton("resetProbe", () => ({ owner: "file B" }));
    expect(second).not.toBe(first);
    expect(second.owner).toBe("file B");
  });

  it("non tocca i simboli globali di altri (Sentry, OpenTelemetry…)", () => {
    const foreign = Symbol.for("not-ours.probe");
    const store = globalThis as Record<symbol, unknown>;
    store[foreign] = "keep";

    resetSharedStateBetweenFiles();

    expect(store[foreign]).toBe("keep");
    delete store[foreign];
  });

  it("ricarica i moduli: lo stato di modulo non passa al file dopo", async () => {
    const first = await import("@/lib/process-singleton");

    resetSharedStateBetweenFiles();

    const second = await import("@/lib/process-singleton");
    expect(second).not.toBe(first);
  });
});
