import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import type { ReceiptPrintHeader } from "@/lib/printing/types";

/**
 * Intestazione dell'esercente per lo scontrino stampato.
 *
 * Viene letta **server-side** e passata come prop ai client component di cassa
 * e storico, invece di essere richiesta al momento della stampa: dopo
 * l'emissione un round-trip in più si vedrebbe (principio #1, performance
 * percepita), e l'auto-stampa deve partire senza attese.
 *
 * `cache()` di React deduplica la query nella stessa richiesta, così una
 * pagina che ha già bisogno di altri campi del business non paga due SELECT.
 */
async function fetchPrintHeader(
  businessId: string,
): Promise<ReceiptPrintHeader | null> {
  const [row] = await getDb()
    .select({
      businessName: businesses.businessName,
      vatNumber: businesses.vatNumber,
      address: businesses.address,
      city: businesses.city,
      province: businesses.province,
      zipCode: businesses.zipCode,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  // Ragione sociale e P.IVA sono nullable a schema (il business nasce
  // incompleto in onboarding). Senza di esse lo scontrino non è intestabile:
  // meglio non avere header — la stampa termica si disabilita e il bottone
  // ripiega sul PDF — che stamparne uno mutilo su un documento fiscale.
  if (!row?.businessName || !row.vatNumber) return null;

  return { ...row, businessName: row.businessName, vatNumber: row.vatNumber };
}

export const fetchReceiptPrintHeader: (
  businessId: string,
) => Promise<ReceiptPrintHeader | null> = cache(fetchPrintHeader);
