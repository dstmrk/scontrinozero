import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia sul foglio di stile globale, sullo stesso principio di
 * `routable-segments.test.ts`: qui vivono due regole che sembrano rimuovibili
 * e non lo sono, perché il loro effetto è osservabile solo su un telefono con
 * la PWA installata — mai in un browser desktop, mai in un test di componente.
 */
const GLOBALS_CSS = readFileSync(
  path.join(import.meta.dirname, "globals.css"),
  "utf8",
);

describe("globals.css — regole della PWA installata", () => {
  it("neutralizza il pull-to-refresh, che nella PWA butterebbe via il carrello", () => {
    expect(GLOBALS_CSS).toContain("overscroll-behavior-y: contain");
  });

  it("lo fa solo in standalone: in browser il gesto è un'affordance attesa", () => {
    const rule = /@media \(display-mode: standalone\) \{[^}]*html,\s*body \{/;

    expect(rule.test(GLOBALS_CSS)).toBe(true);
  });
});
