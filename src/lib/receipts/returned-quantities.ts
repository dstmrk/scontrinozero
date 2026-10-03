import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { commercialDocuments } from "@/db/schema";
import { fetchLinesByDocIds } from "@/lib/receipts/document-lines";

/** Pezzi già resi per vendita (`id`) e per `lineIndex`. */
export type ReturnedByLine = Map<string, Map<number, number>>;

/**
 * Colonna SQL "questa vendita ha almeno un reso accettato", da mettere nella
 * SELECT della vendita: l'annullo la legge prima di aprire la sessione AdE,
 * perché annullare una vendita resa storna il corrispettivo due volte e l'AdE
 * lo accetta (HAR.md #19f).
 *
 * La vendita esterna è nominata con la tabella di proposito. Nella lista della
 * SELECT drizzle rende `commercialDocuments.id` come `"id"` nudo, e dentro la
 * subquery `"id"` si risolverebbe su `r.id`: una guardia sempre falsa, che
 * nessun test con il DB mockato vedrebbe.
 */
export function saleHasAcceptedReturn(): SQL<boolean> {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM ${commercialDocuments} AS r
    WHERE r.returned_document_id = ${commercialDocuments}.id
      AND r.kind = 'RETURN'
      AND r.status = 'ACCEPTED'
  )`;
}

/** Stesso contratto di `fetchLinesByDocIds`: db del pool o `tx`. */
type QueryRunner = {
  select: ReturnType<typeof getDb>["select"];
};

/**
 * Pezzi già resi per ogni riga delle vendite indicate, dai resi accettati
 * registrati da ScontrinoZero. Lo leggono lo storico (badge, tetto del
 * dialog di reso) e la Developer API (`returnedQuantity` nel dettaglio).
 *
 * Una query sui resi e una sulle loro righe, invece di un JOIN per pagina:
 * le righe del reso portano il `lineIndex` della vendita
 * (`src/lib/receipts/return-lines.ts`), quindi la somma si fa per chiave.
 * Le quantità si sommano in centesimi interi, come il servizio di reso.
 *
 * I resi fatti dal portale AdE qui non ci sono: li vede solo il servizio di
 * reso, che rilegge il dettaglio AdE prima di trasmettere.
 */
export async function fetchReturnedByLine(
  saleIds: readonly string[],
  runner: QueryRunner = getDb(),
): Promise<ReturnedByLine> {
  const byLine: ReturnedByLine = new Map();
  if (saleIds.length === 0) return byLine;

  const returns = await runner
    .select({
      id: commercialDocuments.id,
      saleId: commercialDocuments.returnedDocumentId,
    })
    .from(commercialDocuments)
    .where(
      and(
        inArray(commercialDocuments.returnedDocumentId, [...saleIds]),
        eq(commercialDocuments.kind, "RETURN"),
        eq(commercialDocuments.status, "ACCEPTED"),
      ),
    );
  if (returns.length === 0) return byLine;

  const saleOf = new Map(returns.map((r) => [r.id, r.saleId]));
  const lines = await fetchLinesByDocIds(
    returns.map((r) => r.id),
    runner,
  );
  for (const line of lines) {
    const saleId = saleOf.get(line.documentId);
    if (!saleId) continue;
    const perLine = byLine.get(saleId) ?? new Map<number, number>();
    const cents =
      Math.round((perLine.get(line.lineIndex) ?? 0) * 100) +
      Math.round(Number(line.quantity) * 100);
    perLine.set(line.lineIndex, cents / 100);
    byLine.set(saleId, perLine);
  }
  return byLine;
}
