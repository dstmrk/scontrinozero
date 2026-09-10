import { describe, expect, it } from "vitest";
import { compareStoricoOrder, type StoricoOrderKey } from "./storico-order";

function key(
  iso: string,
  origin: "local" | "ade",
  sortId: string,
): StoricoOrderKey {
  return { adeRegisteredAt: new Date(iso), origin, sortId };
}

describe("compareStoricoOrder", () => {
  it("mette prima le righe più recenti", () => {
    const rows = [
      key("2026-08-10T10:00:00Z", "local", "a"),
      key("2026-08-12T10:00:00Z", "local", "b"),
    ].sort(compareStoricoOrder);

    expect(rows.map((r) => r.sortId)).toEqual(["b", "a"]);
  });

  it("a parità di istante la sorgente decide prima degli identificativi", () => {
    const rows = [
      key("2026-08-10T10:00:00Z", "local", "zzz"),
      key("2026-08-10T10:00:00Z", "ade", "aaa"),
    ].sort(compareStoricoOrder);

    expect(rows.map((r) => r.origin)).toEqual(["ade", "local"]);
  });

  it("dentro la stessa sorgente decide l'identificativo, decrescente", () => {
    const rows = [
      key("2026-08-10T10:00:00Z", "local", "aaa"),
      key("2026-08-10T10:00:00Z", "local", "zzz"),
    ].sort(compareStoricoOrder);

    expect(rows.map((r) => r.sortId)).toEqual(["zzz", "aaa"]);
  });

  it("due righe identiche non si scambiano", () => {
    const a = key("2026-08-10T10:00:00Z", "local", "aaa");
    expect(compareStoricoOrder(a, { ...a })).toBe(0);
  });

  it("l'ordine è totale: nessuna coppia resta indecisa", () => {
    const rows = [
      key("2026-08-10T10:00:00Z", "local", "aaa"),
      key("2026-08-10T10:00:00Z", "local", "bbb"),
      key("2026-08-10T10:00:00Z", "ade", "111"),
      key("2026-08-11T10:00:00Z", "ade", "222"),
    ];

    for (const a of rows) {
      for (const b of rows) {
        if (a === b) continue;
        expect(compareStoricoOrder(a, b)).not.toBe(0);
      }
    }
  });
});
