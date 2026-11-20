import { afterAll, vi } from "vitest";

/**
 * La suite gira con `isolate: false` (vitest.config.ts): i file di un worker
 * condividono registry dei moduli, `process.env` e globali. Questo è lo stato
 * che un file può lasciare al successivo, e qui si azzera alla fine di ogni
 * file. Lo stato dentro un file resta responsabilità dei suoi beforeEach
 * (skill `testing-patterns`).
 *
 * - restoreAllMocks: spy su oggetti condivisi (console, Date, global.fetch…)
 * - unstubAllEnvs / unstubAllGlobals: vi.stubEnv / vi.stubGlobal
 * - process.env torna com'era all'avvio del worker: unstubAllEnvs copre solo
 *   vi.stubEnv, e 31 file assegnano `process.env.X = …` direttamente. Un
 *   ADE_MODE lasciato da un file cambiava il ramo preso da auth-actions in un
 *   altro (la coverage dei branch variava col seed).
 * - useRealTimers: un file che chiude con i fake timer attivi
 * - resetModules: moduli importati (e i loro singleton) e factory vi.mock
 * - i `processSingleton` (limiter, cache di sessione AdE, request context)
 *   vivono su globalThis sotto `Symbol.for("scontrinozero.*")` proprio per
 *   sopravvivere a due copie dello stesso modulo: sopravvivono anche a
 *   resetModules, e il primo file del worker che li costruiva (col limiter
 *   vero o col mock di un altro file) li imponeva a tutti i successivi.
 *   Il prefisso è il contratto di `src/lib/process-singleton.test.ts`.
 */
const PROCESS_SINGLETON_PREFIX = "scontrinozero.";

/**
 * Lo snapshot vive su globalThis, non in una costante di modulo: questo file
 * viene rivalutato prima di ogni file di test, e una costante catturerebbe
 * l'env già sporcato dal file precedente.
 */
const ENV_AT_WORKER_START = Symbol.for("vitest.reset-between-files.env");

function workerStartEnv(): Readonly<Record<string, string | undefined>> {
  const store = globalThis as Record<symbol, unknown>;
  store[ENV_AT_WORKER_START] ??= { ...process.env };
  return store[ENV_AT_WORKER_START] as Record<string, string | undefined>;
}

workerStartEnv();

function restoreEnv(snapshot: Readonly<Record<string, string | undefined>>) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (process.env[key] !== value) process.env[key] = value;
  }
}

export function resetSharedStateBetweenFiles(): void {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  restoreEnv(workerStartEnv());
  vi.useRealTimers();
  vi.resetModules();
  const store = globalThis as Record<symbol, unknown>;
  for (const symbol of Object.getOwnPropertySymbols(store)) {
    if (Symbol.keyFor(symbol)?.startsWith(PROCESS_SINGLETON_PREFIX)) {
      delete store[symbol];
    }
  }
}

afterAll(resetSharedStateBetweenFiles);
