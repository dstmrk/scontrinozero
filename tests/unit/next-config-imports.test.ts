/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `next.config.ts` è transpilato da Next senza i path di tsconfig: un import
 * `@/...` in un file che il config carica, **anche indirettamente**, fa
 * fallire `next build` con "Cannot find module" prima di generare le route
 * (PR #536). Il 10/11/2026 è successo con `src/lib/request-context.ts`,
 * caricato da `next.config.ts` → `hostname-env.ts` → `logger.ts`.
 *
 * Il test segue gli import relativi a partire dal config e pretende che nessun
 * file raggiunto usi l'alias.
 */
const ROOT = resolve(__dirname, "../..");

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  // Il parser di TypeScript, non una regex: legge anche `import type` ed
  // `export … from`, e salta stringhe e commenti.
  const { importedFiles } = ts.preProcessFile(
    readFileSync(file, "utf8"),
    true,
    true,
  );
  return importedFiles.map((imported) => imported.fileName);
}

function walkConfigGraph(): { files: string[]; aliased: string[] } {
  const entry = join(ROOT, "next.config.ts");
  const seen = new Set<string>();
  const queue = [entry];
  const aliased: string[] = [];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith("@/")) {
        aliased.push(`${relative(ROOT, file)} → ${specifier}`);
      } else if (specifier.startsWith(".")) {
        const target = resolveRelative(file, specifier);
        if (target) queue.push(target);
      }
    }
  }
  return { files: [...seen].map((f) => relative(ROOT, f)), aliased };
}

describe("grafo degli import di next.config.ts", () => {
  it("raggiunge davvero i moduli applicativi (il test misura qualcosa)", () => {
    const { files } = walkConfigGraph();
    expect(files).toContain("src/lib/logger.ts");
    expect(files).toContain("src/lib/request-context.ts");
  });

  it("nessun file raggiunto usa l'alias @/", () => {
    expect(walkConfigGraph().aliased).toEqual([]);
  });
});
