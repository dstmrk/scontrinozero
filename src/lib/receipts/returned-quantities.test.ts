// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { fetchReturnedByLine } from "./returned-quantities";

/**
 * Runner finto: la prima select sono i resi (risolve al `.where`), la
 * seconda le loro righe (risolve all'`.orderBy` di `fetchLinesByDocIds`).
 */
function fakeRunner(returns: unknown[], lines: unknown[]) {
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve(returns) }),
    })
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ orderBy: () => Promise.resolve(lines) }),
      }),
    });
  return { select } as unknown as Parameters<typeof fetchReturnedByLine>[1];
}

describe("fetchReturnedByLine", () => {
  it("nessuna vendita: nessuna query", async () => {
    const runner = fakeRunner([], []);

    const result = await fetchReturnedByLine([], runner);

    expect(result.size).toBe(0);
    expect(runner?.select).not.toHaveBeenCalled();
  });

  it("vendite senza resi: mappa vuota, una sola query", async () => {
    const runner = fakeRunner([], []);

    const result = await fetchReturnedByLine(["sale-1"], runner);

    expect(result.size).toBe(0);
    expect(runner?.select).toHaveBeenCalledTimes(1);
  });

  it("somma i resi per vendita e riga, in centesimi interi", async () => {
    const runner = fakeRunner(
      [
        { id: "ret-1", saleId: "sale-1" },
        { id: "ret-2", saleId: "sale-1" },
        { id: "ret-3", saleId: "sale-2" },
      ],
      [
        { documentId: "ret-1", lineIndex: 0, quantity: "0.100" },
        { documentId: "ret-2", lineIndex: 0, quantity: "0.200" },
        { documentId: "ret-2", lineIndex: 1, quantity: "1.000" },
        { documentId: "ret-3", lineIndex: 0, quantity: "2.000" },
        // Riga di un reso non richiesto: ignorata.
        { documentId: "ret-x", lineIndex: 0, quantity: "9.000" },
      ],
    );

    const result = await fetchReturnedByLine(["sale-1", "sale-2"], runner);

    // 0.1 + 0.2 in float darebbe 0.30000000000000004.
    expect(result.get("sale-1")?.get(0)).toBe(0.3);
    expect(result.get("sale-1")?.get(1)).toBe(1);
    expect(result.get("sale-2")?.get(0)).toBe(2);
  });
});
