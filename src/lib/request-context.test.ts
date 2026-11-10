/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import {
  annotateRequestContext,
  getRequestContext,
  runWithRequestContext,
} from "./request-context";

describe("request context", () => {
  it("fuori da una richiesta non c'è contesto", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("dentro runWithRequestContext espone il requestId, anche dopo un await", async () => {
    const seen = await runWithRequestContext("req-1", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return getRequestContext()?.requestId;
    });
    expect(seen).toBe("req-1");
    expect(getRequestContext()).toBeUndefined();
  });

  it("restituisce il valore della funzione", () => {
    expect(runWithRequestContext("req-1", () => 42)).toBe(42);
  });

  it("due richieste concorrenti non si vedono a vicenda", async () => {
    const read = (id: string, ms: number) =>
      runWithRequestContext(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return getRequestContext()?.requestId;
      });
    await expect(Promise.all([read("a", 5), read("b", 1)])).resolves.toEqual([
      "a",
      "b",
    ]);
  });

  it("annotateRequestContext aggiunge chiave e attività alla richiesta corrente", () => {
    runWithRequestContext("req-1", () => {
      annotateRequestContext({ apiKeyId: "key-1", businessId: "biz-1" });
      expect(getRequestContext()).toEqual({
        requestId: "req-1",
        apiKeyId: "key-1",
        businessId: "biz-1",
      });
    });
  });

  it("annotateRequestContext fuori da una richiesta non fa niente", () => {
    annotateRequestContext({ apiKeyId: "key-1", businessId: "biz-1" });
    expect(getRequestContext()).toBeUndefined();
  });

  /**
   * Il contesto è letto dal logger, che Turbopack duplica fra layer action e
   * rsc come ogni modulo (`src/lib/process-singleton.ts`): lo storage deve
   * essere uno per processo, o le righe loggate dalla copia dell'altro layer
   * (per esempio dentro la cache di sessione AdE) resterebbero senza
   * requestId.
   */
  it("una copia fresca del modulo vede il contesto aperto dall'altra", async () => {
    vi.resetModules();
    const other = await import("./request-context");
    expect(other.getRequestContext).not.toBe(getRequestContext);
    runWithRequestContext("req-1", () => {
      expect(other.getRequestContext()?.requestId).toBe("req-1");
    });
  });
});
