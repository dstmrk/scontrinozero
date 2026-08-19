import { and, eq, or, type SQL } from "drizzle-orm";

import { commercialDocuments } from "@/db/schema";

/**
 * Il minimo per decidere se un documento e' stampabile. Lo soddisfa
 * `SelectCommercialDocument` senza adattatori.
 */
export interface PrintableDocumentRef {
  readonly kind: "SALE" | "VOID";
  readonly status:
    "PENDING" | "ACCEPTED" | "VOID_ACCEPTED" | "REJECTED" | "ERROR";
}

/**
 * Un documento commerciale e' scaricabile in PDF?
 *
 * | kind | status         | stampabile |
 * | ---- | -------------- | ---------- |
 * | SALE | ACCEPTED       | si'        |
 * | SALE | VOID_ACCEPTED  | **no**     |
 * | VOID | VOID_ACCEPTED  | si'        |
 *
 * Le prime due righe dicono la regola fiscale: annullato uno scontrino, la
 * ricevuta di vendita non e' piu' un documento valido e non va piu' consegnata
 * — quello valido e' la ricevuta di annullamento. La terza riga e' il motivo
 * per cui questa regola vive qui e non in una WHERE: **`VOID_ACCEPTED` ha due
 * letture diverse a seconda del `kind`** — su un SALE significa "questa vendita
 * e' stata annullata", su un VOID significa "questo annullo e' riuscito". La
 * condizione e' quindi bidimensionale e non e' esprimibile sul solo `status`;
 * un `eq(status, "ACCEPTED")` copiato nei lettori e' la formulazione
 * monodimensionale, ed e' il bug che nascondeva la ricevuta di annullamento.
 *
 * Tenerla in un posto solo e' quello che impedisce a due superfici di dare
 * risposte diverse sullo stesso documento. Chi aggiunge un lettore chiama
 * questa funzione (o `printableDocumentCondition()` per una query) invece di
 * riscrivere il predicato.
 *
 * Nota per chi passa di qui: la doppia lettura di `VOID_ACCEPTED` e' una
 * sbavatura reale dell'enum, ma non si ripulisce a costo zero — `status` e'
 * esposto da `/api/v1` (contratto pubblico versionato) e l'indice unique
 * parziale della migrazione 0012 ha il valore cablato nel predicato. Il momento
 * per farlo e' un'eventuale `/api/v2`.
 */
export function isPrintableDocument(doc: PrintableDocumentRef): boolean {
  if (doc.kind === "SALE") return doc.status === "ACCEPTED";
  return doc.status === "VOID_ACCEPTED";
}

/**
 * La stessa regola come condizione Drizzle, per filtrarla nel DB invece che in
 * memoria. Da comporre in `and(...)` con gli altri vincoli del chiamante
 * (ownership, id, `adeTransactionId IS NOT NULL`).
 */
export function printableDocumentCondition(): SQL {
  return or(
    and(
      eq(commercialDocuments.kind, "SALE"),
      eq(commercialDocuments.status, "ACCEPTED"),
    ),
    and(
      eq(commercialDocuments.kind, "VOID"),
      eq(commercialDocuments.status, "VOID_ACCEPTED"),
    ),
  )!;
}
