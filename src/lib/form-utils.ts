/**
 * Utility per estrarre stringhe da `FormData` in modo type-safe e per
 * costruire `FormData` da oggetti tipati.
 *
 * `FormData.get()` ritorna `FormDataEntryValue | null` (string | File | null).
 * Castarlo direttamente a `string` con `as string` è bypass non controllato:
 * questi helper evitano il cast e centralizzano la sanitizzazione (`.trim()`).
 */

/** Ritorna la stringa trimmed; "" se la chiave manca o è un File. */
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
