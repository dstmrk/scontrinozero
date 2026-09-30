import tailwind from "@tailwindcss/postcss";
import { transform } from "lightningcss";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
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

/**
 * Tailwind 4 estrae le classi candidate da **ogni** file non ignorato del
 * repo, commenti compresi, e genera CSS per ognuna. Una stringa che sembra una
 * classe con valore arbitrario ma produce CSS non valido — un padding con
 * `env` e i tre puntini fra le quadre, scritto in un commento per spiegare una
 * classe — finisce nel foglio compilato, e
 * Lightning CSS in `next dev` la rifiuta: 500 su ogni route, perché
 * `globals.css` sta nel root layout. `next build` invece passa, quindi la CI
 * non se ne accorgeva: ci si è arrivati solo aprendo il dev server.
 *
 * Il test rifà la stessa catena di `postcss.config.mjs` e poi il parse senza
 * error recovery che fa il dev server.
 */
describe("globals.css — il CSS generato da Tailwind", () => {
  it("si compila senza errori, come in next dev", async () => {
    const repoRoot = path.join(import.meta.dirname, "..", "..");
    const from = path.join(import.meta.dirname, "globals.css");

    const { css } = await postcss([tailwind({ base: repoRoot })]).process(
      GLOBALS_CSS,
      { from },
    );

    let failure: string | null = null;
    try {
      transform({
        filename: "globals.css",
        code: Buffer.from(css),
        errorRecovery: false,
      });
    } catch (error) {
      // Il messaggio di Lightning CSS dice solo riga e colonna del CSS
      // generato: la riga sopra è il selettore, cioè la classe da cercare.
      const { message, loc } = error as {
        message: string;
        loc?: { line: number };
      };
      const selector = loc ? css.split("\n")[loc.line - 2]?.trim() : "";
      failure = `${message} — classe: ${selector}`;
    }

    expect(failure).toBeNull();
  });
});
