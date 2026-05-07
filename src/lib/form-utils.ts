/**
 * Utility per estrarre stringhe da `FormData` in modo type-safe e per
 * costruire `FormData` da oggetti tipati.
 *
 * `FormData.get()` ritorna `FormDataEntryValue | null` (string | File | null).
 * Castarlo direttamente a `string` con `as string` è bypass non controllato:
 * questi helper evitano il cast e centralizzano la sanitizzazione.
 *
 * **IMPORTANTE — campi password**: usare `getFormStringRaw`, NON
 * `getFormString`. Il `.trim()` cambierebbe la semantica delle credenziali:
 * un utente registrato con una password contenente spazi terminali non
 * riuscirebbe più a fare login dopo che il server inizia a trimmare gli
 * input. Le password sono arbitrarie per definizione: si leggono e si
 * confrontano byte-per-byte.
 */

/** Ritorna la stringa trimmed; "" se la chiave manca o è un File.
 * Non usare per password — vedi `getFormStringRaw`. */
export function getFormString(fd: FormData, key: string): string {
  const raw = fd.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

/** Come getFormString ma ritorna null se la stringa risultante è vuota. */
export function getFormStringOrNull(fd: FormData, key: string): string | null {
  const v = getFormString(fd, key);
  return v.length === 0 ? null : v;
}

/**
 * Variante di `getFormString` che NON applica `.trim()`.
 * Da usare per i campi in cui ogni byte è semanticamente significativo:
 * password, captcha token, credenziali AdE (PIN/codice fiscale eccetto
 * PIN che è già regex-validated `^\d{10}$`).
 */
export function getFormStringRaw(fd: FormData, key: string): string {
  const raw = fd.get(key);
  return typeof raw === "string" ? raw : "";
}

/**
 * Costruisce un `FormData` da un oggetto. Le entry `null`/`undefined` vengono
 * saltate (consentono ai default Zod di applicarsi server-side).
 */
export function objectToFormData<
  T extends Record<string, string | number | boolean | null | undefined>,
>(obj: T): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    fd.set(k, String(v));
  }
  return fd;
}
