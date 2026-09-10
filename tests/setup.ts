import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { assertFunctionalWebStorage } from "./_helpers/assert-functional-web-storage";

// Fail-fast se lo Storage di jsdom non ha sovrascritto lo stub Web Storage
// di Node ≥ 25 (vedi il commento nell'helper e vitest.config.ts). Solo con
// DOM attivo: i file con pragma `@vitest-environment node` caricano comunque
// questo setup ma non hanno (né devono avere) Web Storage.
if (typeof window !== "undefined") {
  assertFunctionalWebStorage();
}

// jsdom non implementa ResizeObserver, e diversi primitivi Radix (Checkbox,
// Select, Popover) lo chiamano al mount per misurarsi. Senza questo stub un
// test fallisce con `ResizeObserver is not defined` in un punto che non ha
// niente a che vedere con ciò che sta verificando. Sta qui e non nei singoli
// file perché è una mancanza dell'ambiente, non una scelta del test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;
}

afterEach(cleanup);
