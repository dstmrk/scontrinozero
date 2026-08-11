import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia di routing per l'App Router.
 *
 * Una cartella con prefisso `_` è una **private folder**: Next la esclude dal
 * routing insieme a tutte le sue sottocartelle, silenziosamente. Un `route.ts`
 * finito lì dentro compila, passa i suoi unit test (che importano `GET`
 * direttamente) e risponde **404 in ogni ambiente** — indistinguibile da un
 * deploy vecchio.
 *
 * È già costato le due probe di smoke della regola 25: `_health/env` e
 * `_debug/sentry-sentinel` non sono mai state raggiungibili, e il sentinel
 * maschera il caso perché risponde 404 anche quando il token è sbagliato.
 * Ora vivono sotto `src/app/api/health/`.
 *
 * Le private folder restano legittime per file colocati non routabili
 * (componenti, helper): questo test guarda **solo** i file di routing.
 */
// Il test vive dentro `src/app/` (colocato, non routabile: è un `.test.ts`).
const APP_DIR = import.meta.dirname;
const ROUTING_FILES = new Set(["route.ts", "route.tsx", "page.tsx", "page.ts"]);

function findRoutingFilesInPrivateFolders(
  dir: string,
  insidePrivate: boolean,
  found: string[],
): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findRoutingFilesInPrivateFolders(
        full,
        insidePrivate || entry.name.startsWith("_"),
        found,
      );
    } else if (insidePrivate && ROUTING_FILES.has(entry.name)) {
      found.push(path.relative(APP_DIR, full));
    }
  }
  return found;
}

describe("App Router: nessuna route dentro una private folder", () => {
  it("non trova route.ts/page.tsx sotto cartelle con prefisso _", () => {
    const orphans = findRoutingFilesInPrivateFolders(APP_DIR, false, []);

    expect(orphans).toEqual([]);
  });
});
