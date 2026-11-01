/**
 * Un'istanza per processo Node, condivisa da server action e route handler.
 *
 * Una costante di modulo (`export const x = new ...`) non basta. Turbopack
 * compila le server action nel layer `action-browser` e le route nel layer
 * `rsc`: lo stesso file diventa due moduli con due ID, quindi due istanze
 * nello stesso processo. Misurato sulla build di produzione (Next 16.4,
 * novembre 2026). Per lo stato che deve valere da entrambe le parti
 * (limiter, cache di sessione AdE) l'istanza si appende a `globalThis` sotto
 * un `Symbol.for`, che è unico per processo qualunque cosa faccia il bundler.
 *
 * @param key     - nome stabile, prefissato con `scontrinozero.`
 * @param factory - costruisce l'istanza alla prima richiesta
 */
export function processSingleton<T>(key: string, factory: () => T): T {
  const store = globalThis as Record<symbol, unknown>;
  const symbol = Symbol.for(`scontrinozero.${key}`);
  if (!(symbol in store)) store[symbol] = factory();
  return store[symbol] as T;
}
