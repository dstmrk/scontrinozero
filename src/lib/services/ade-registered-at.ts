import type { AdeResponse } from "@/lib/ade/types";

/** Patch parziale: la chiave c'e' solo quando abbiamo un istante autorevole. */
type AdeRegisteredAtPatch = { adeRegisteredAt: Date } | Record<string, never>;

/**
 * Patch parziale per la UPDATE che marca un documento ACCEPTED/VOID_ACCEPTED:
 * porta `adeRegisteredAt` solo quando l'AdE ci ha dato un istante utilizzabile.
 *
 * `commercial_documents.ade_registered_at` e' NOT NULL con `DEFAULT now()`
 * (migrazione 0031): la riga nasce PENDING con il nostro orologio, e questa
 * UPDATE lo sostituisce con il timestamp autorevole derivato dall'header HTTP
 * `Date` della risposta AdE (HAR.md #16b).
 *
 * Perche' un oggetto da spandere invece di un valore da assegnare: su una
 * colonna NOT NULL, `adeRegisteredAt: undefined` non e' un no-op leggibile —
 * lascia sì il default, ma nasconde nel call site la differenza fra "l'AdE non
 * ce l'ha detto" e "non volevamo toccarla". Omettere la chiave rende la UPDATE
 * esplicita: si scrive solo quando c'e' qualcosa di meglio del default.
 *
 * Un `registeredAt` illeggibile viene scartato come se fosse assente: il
 * `RealAdeClient` lo produce gia' validato, ma questa e' la frontiera fra un
 * dato di rete e una scrittura fiscale, e una `Invalid Date` in un timestamptz
 * NOT NULL farebbe fallire l'intera transazione di finalizzazione — proprio
 * quella che non deve mai fallire dopo una submit andata a buon fine.
 */
export function adeRegisteredAtPatch(
  adeResponse: AdeResponse,
): AdeRegisteredAtPatch {
  if (!adeResponse.registeredAt) return {};

  return adeRegisteredAtPatchFromDate(new Date(adeResponse.registeredAt));
}

/**
 * Stessa patch, ma a partire da un istante gia' in forma di `Date`: e' il caso
 * del recovery stale-pending, dove l'istante autorevole non arriva dall'header
 * `Date` di una submit ma dal campo `data` del documento riconciliato via
 * `searchDocuments` (REVIEW.md #91), gia' parsato da `parseAdeResultDate`.
 *
 * `null`/`undefined` sono i due modi in cui il chiamante dice "non ho un istante
 * migliore del default": `null` = documento riconciliato con `data` illeggibile,
 * `undefined` = finalizzazione senza documento riconciliato (il retry della sola
 * UPDATE, che non interroga AdE). In entrambi i casi la chiave viene omessa e
 * resta il `DEFAULT now()` dell'INSERT — la finalizzazione non deve MAI fallire
 * per un timestamp mancante.
 */
export function adeRegisteredAtPatchFromDate(
  registeredAt: Date | null | undefined,
): AdeRegisteredAtPatch {
  if (!registeredAt || Number.isNaN(registeredAt.getTime())) return {};

  return { adeRegisteredAt: registeredAt };
}
