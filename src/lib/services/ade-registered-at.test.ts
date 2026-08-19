import { describe, it, expect } from "vitest";

import { adeRegisteredAtPatch } from "./ade-registered-at";
import type { AdeResponse } from "@/lib/ade/types";

function makeResponse(overrides: Partial<AdeResponse> = {}): AdeResponse {
  return {
    esito: true,
    idtrx: "226275972",
    progressivo: "DCW2026/2630-4363",
    errori: [],
    ...overrides,
  };
}

describe("adeRegisteredAtPatch", () => {
  it("converte registeredAt in Date per la UPDATE", () => {
    const patch = adeRegisteredAtPatch(
      makeResponse({ registeredAt: "2026-08-19T07:53:41.000Z" }),
    );

    expect(patch).toEqual({
      adeRegisteredAt: new Date("2026-08-19T07:53:41.000Z"),
    });
  });

  // La colonna e' NOT NULL con DEFAULT now(): omettere la chiave lascia il
  // valore scritto all'INSERT, che e' il comportamento voluto.
  it("omette la chiave quando registeredAt e' assente", () => {
    expect(adeRegisteredAtPatch(makeResponse())).toEqual({});
  });

  it("omette la chiave quando registeredAt e' una data invalida", () => {
    const patch = adeRegisteredAtPatch(
      makeResponse({ registeredAt: "non-una-data" }),
    );

    expect(patch).toEqual({});
  });

  it("omette la chiave quando registeredAt e' una stringa vuota", () => {
    expect(adeRegisteredAtPatch(makeResponse({ registeredAt: "" }))).toEqual(
      {},
    );
  });

  // Difesa a valle: un Invalid Date su un timestamptz NOT NULL farebbe fallire
  // la transazione di finalizzazione, la sola che non deve mai fallire dopo una
  // submit andata a buon fine.
  it("non produce mai un adeRegisteredAt invalido", () => {
    for (const value of ["", "non-una-data", "2026-13-45T99:99:99Z"]) {
      const patch = adeRegisteredAtPatch(makeResponse({ registeredAt: value }));
      const stamp = (patch as { adeRegisteredAt?: Date }).adeRegisteredAt;

      expect(stamp === undefined || !Number.isNaN(stamp.getTime())).toBe(true);
    }
  });
});
