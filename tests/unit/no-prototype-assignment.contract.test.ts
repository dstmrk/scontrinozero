import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nessun file di test assegna direttamente un metodo a un prototype.
 *
 * La suite gira con `isolate: false`: i file di un worker condividono i
 * prototype dell'ambiente. `HTMLElement.prototype.scrollIntoView = vi.fn()`
 * non viene ripristinato da nessun reset (né `restoreAllMocks`, né il reset
 * fra file di `tests/reset-between-files.ts`), sopravvive al file e cambia
 * il comportamento del successivo. Misurato: oscurava lo spy che
 * `extra-settings-section.test.tsx` metteva su `Element.prototype`, più in
 * basso nella catena, e il test falliva solo in certi ordini.
 *
 * Al suo posto: `vi.spyOn(Proto, "metodo")`, ripristinato a fine file; i
 * polyfill d'ambiente (jsdom non implementa X) vanno in `tests/setup.ts`.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCANNED_DIRS = ["src", "tests"];
const THIS_FILE = path.join(
  "tests",
  "unit",
  "no-prototype-assignment.contract.test.ts",
);

/** `.prototype.nome = ` o `.prototype["nome"] = `, non `==`/`===`. */
const PROTOTYPE_ASSIGNMENT =
  /\.prototype(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=(?!=)/;

function testFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.test\.tsx?$/.test(entry.name))
    .map((entry) =>
      path.relative(ROOT, path.join(entry.parentPath, entry.name)),
    );
}

describe("nessun prototype assegnato nei test", () => {
  it("la regex riconosce le forme vietate e lascia stare i confronti", () => {
    expect(
      PROTOTYPE_ASSIGNMENT.test(
        "window.HTMLElement.prototype.scrollIntoView = vi.fn();",
      ),
    ).toBe(true);
    expect(
      PROTOTYPE_ASSIGNMENT.test('Element.prototype["scrollIntoView"] = spy;'),
    ).toBe(true);
    expect(
      PROTOTYPE_ASSIGNMENT.test("if (x.prototype.foo === bar) return;"),
    ).toBe(false);
    expect(
      PROTOTYPE_ASSIGNMENT.test(
        'vi.spyOn(Element.prototype, "scrollIntoView");',
      ),
    ).toBe(false);
  });

  it("nessun file di test assegna un metodo a un prototype", () => {
    const offenders = SCANNED_DIRS.flatMap(testFiles)
      .filter((file) => file !== THIS_FILE)
      .flatMap((file) =>
        readFileSync(path.join(ROOT, file), "utf8")
          .split("\n")
          .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
          .filter(({ text }) => PROTOTYPE_ASSIGNMENT.test(text)),
      )
      .map(({ file, line, text }) => `${file}:${line}  ${text}`);

    expect(offenders).toEqual([]);
  });
});
