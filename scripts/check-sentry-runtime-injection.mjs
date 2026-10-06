/**
 * Verifica che la build standalone contenga il loader ESM di Sentry completo
 * dei suoi import, cioè che gli span dei diagnostics channel (postgres
 * compreso) vengano davvero registrati in produzione.
 *
 * Da `@sentry/nextjs` 11 le integrazioni channel-based passano per un loader
 * che Sentry registra con `Module.register()` su Node < 24.13 (la nostra
 * immagine è `node:22-alpine`). Il loader è
 * `@sentry/server-runtime-injection/build/esm/hook.js`, caricato per path a
 * runtime: il file tracing di Next ha copiato `hook.js` nella standalone ma
 * non i suoi import `./vendored/...`. In v1.9.0 il loader falliva, Sentry
 * degradava a un **warning** nei log del container e il build restava verde;
 * il fix è `outputFileTracingIncludes` in `next.config.ts`.
 *
 * Stessa lezione di `check-service-worker.mjs`: l'unica verifica che tiene è
 * sull'artefatto. Il check importa il loader dalla standalone in un processo
 * Node separato, come fa `Module.register()`, così un import mancante a
 * qualunque profondità del grafo fa fallire il build.
 *
 * Run: node scripts/check-sentry-runtime-injection.mjs  (incatenato a
 * `npm run build`, così vale anche per il Dockerfile e non solo per la CI)
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

/** Path del loader relativo alla root della standalone. */
export const HOOK_RELATIVE_PATH =
  "node_modules/@sentry/server-runtime-injection/build/esm/hook.js";

/**
 * @param {string} standaloneDir  Root della build standalone (`.next/standalone`).
 * @returns {{ ok: boolean; errors: string[] }}
 */
export function checkSentryRuntimeInjection(standaloneDir) {
  const hookPath = join(standaloneDir, HOOK_RELATIVE_PATH);
  if (!existsSync(hookPath)) {
    return {
      ok: false,
      errors: [
        `Loader Sentry assente: ${HOOK_RELATIVE_PATH} non è nella standalone ` +
          `(${standaloneDir}).`,
      ],
    };
  }

  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL(hookPath).href)});`,
    ],
    { cwd: standaloneDir, encoding: "utf8" },
  );
  if (result.status !== 0) {
    // `stderr` è null se il processo non è nemmeno partito (`result.error`).
    const stderr = result.stderr ?? "";
    const reason =
      stderr.split("\n").find((line) => line.startsWith("Error")) ??
      (stderr.trim() || String(result.error ?? `exit ${result.status}`));
    return {
      ok: false,
      errors: [`Il loader Sentry non si carica dalla standalone: ${reason}`],
    };
  }

  return { ok: true, errors: [] };
}

// Gira solo se eseguito direttamente (non quando importato dai test).
const isMain =
  process.argv[1]?.endsWith("check-sentry-runtime-injection.mjs") === true;
if (isMain) {
  const result = checkSentryRuntimeInjection(
    join(process.cwd(), ".next", "standalone"),
  );
  if (!result.ok) {
    console.error("❌ Sentry runtime injection check failed:");
    for (const err of result.errors) {
      console.error(`   - ${err}`);
    }
    console.error(
      "\nFix: verifica che `outputFileTracingIncludes` in next.config.ts " +
        "copi ancora `@sentry/server-runtime-injection/build/esm/**`.",
    );
    process.exit(1);
  }
  console.log(
    "✅ Sentry runtime injection check passed: loader ESM completo nella standalone.",
  );
}
