/**
 * Verifica che il build abbia davvero emesso il service worker.
 *
 * Esiste per la ragione precisa che ha prodotto REVIEW #84: `@serwist/next`
 * girava come plugin webpack, Next 16 builda con Turbopack, il plugin non
 * partiva — e degradava a un **warning**, lasciando il build verde. Per mesi
 * `/sw.js` è stato 404 in produzione (niente offline, niente installazione su
 * Android) senza che nulla in CI se ne accorgesse.
 *
 * La lezione generalizzata: quando una feature dipende da un artefatto
 * generato, l'unica verifica che tiene è **asserire l'esistenza
 * dell'artefatto**. Verificare il sorgente che lo produce non basta: un tool a
 * monte può smettere di girare del tutto.
 *
 * Run: node scripts/check-service-worker.mjs  (incatenato a `npm run build`,
 * così vale anche per il Dockerfile e non solo per la CI)
 */

import { stat } from "fs/promises";
import { join } from "path";

/**
 * Soglia di plausibilità: un bundle Serwist reale pesa decine di KB (runtime
 * caching + precache manifest). Sotto 1 KB è uno stub, un file troncato o un
 * artefatto lasciato da un run fallito — casi in cui `/sw.js` risponderebbe 200
 * senza fare nulla, che è peggio di un 404 perché silenzioso.
 */
export const MIN_SW_BYTES = 1024;

/**
 * @param {string} swPath  Path assoluto del service worker atteso.
 * @returns {Promise<{ ok: boolean; errors: string[] }>}
 */
export async function checkServiceWorker(swPath) {
  let stats;
  try {
    stats = await stat(swPath);
  } catch {
    return {
      ok: false,
      errors: [
        `Service worker non emesso: ${swPath} non esiste. ` +
          `Lo step \`serwist build\` non è girato o è fallito silenziosamente.`,
      ],
    };
  }

  if (!stats.isFile()) {
    return { ok: false, errors: [`${swPath} esiste ma non è un file.`] };
  }

  if (stats.size < MIN_SW_BYTES) {
    return {
      ok: false,
      errors: [
        `Service worker sospetto: ${swPath} pesa ${stats.size} byte, ` +
          `sotto il minimo di ${MIN_SW_BYTES}. Bundle troncato o stub.`,
      ],
    };
  }

  return { ok: true, errors: [] };
}

// Gira solo se eseguito direttamente (non quando importato dai test).
const isMain = process.argv[1]?.endsWith("check-service-worker.mjs") === true;
if (isMain) {
  const swPath = join(process.cwd(), "public", "sw.js");
  checkServiceWorker(swPath).then((result) => {
    if (!result.ok) {
      console.error("❌ Service worker check failed:");
      for (const err of result.errors) {
        console.error(`   - ${err}`);
      }
      console.error(
        "\nFix: verifica che `serwist build serwist.config.mjs` sia ancora " +
          "incatenato allo script `build` di package.json (REVIEW #84).",
      );
      process.exit(1);
    }
    console.log("✅ Service worker check passed: public/sw.js emesso.");
  });
}
