/**
 * Legge l'id del target puntato dall'hash corrente.
 *
 * Estratto perché due componenti hanno bisogno della stessa lettura e devono
 * concordare: `ScrollToHash` scrolla alle ancore già presenti nell'HTML
 * server-rendered, `ExtraSettingsSection` si apre quando l'hash punta a una
 * card che tiene chiusa. Se le due letture divergessero (una decodifica,
 * l'altra no) il deep-link aprirebbe la sezione senza scrollarci, o viceversa.
 *
 * Fragment malformato (es. `#%E0%A4%A`) → `decodeURIComponent` lancia
 * `URIError`: si degrada al raw invece di propagare (regola 19).
 */
export function readHashId(): string | null {
  const { hash } = globalThis.location;
  if (!hash) return null;
  const raw = hash.slice(1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Snapshot server dell'hash: sempre `null`.
 *
 * L'hash non arriva mai al server — il browser non lo manda nella richiesta —
 * quindi l'HTML server-rendered non può che ignorarlo. Serve a
 * `useSyncExternalStore` per rendere lo scarto esplicito invece di produrre un
 * hydration mismatch: React idrata sullo snapshot server e poi ri-renderizza
 * con quello client (regola 15).
 */
export function readServerHashId(): null {
  return null;
}

/**
 * Sottoscrive i cambi di hash per `useSyncExternalStore`.
 *
 * `hashchange` copre la navigazione in-page; l'atterraggio da un deep-link è
 * già coperto dal primo snapshot client.
 */
export function subscribeToHash(onStoreChange: () => void): () => void {
  globalThis.addEventListener("hashchange", onStoreChange);
  return () => globalThis.removeEventListener("hashchange", onStoreChange);
}
