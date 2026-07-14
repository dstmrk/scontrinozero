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

afterEach(cleanup);
