import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, profiles } from "@/db/schema";
import type { ReceiptPrintHeader } from "@/lib/printing/types";
import { resolveReceiptFooterNote } from "./footer-note";

/**
 * Tutto ciò che l'esercente aggiunge di suo allo scontrino stampato:
 * l'intestazione in testa e il messaggio di cortesia in coda.
 *
 * Un oggetto solo perché è una query sola: le due parti vivono sulla stessa
 * riga `businesses`, e tenerle separate significherebbe leggerla due volte.
 */
export interface ReceiptPrintProfile {
  readonly header: ReceiptPrintHeader;
  /**
   * Messaggio di cortesia (feature Pro) già passato per il gate di piano:
   * `null` quando non c'è o quando il piano non dà più accesso alla feature.
   */
  readonly footerNote: string | null;
}

/**
 * Intestazione e messaggio di cortesia per lo scontrino stampato.
 *
 * Vengono letti **server-side** e passati come prop ai client component di
 * cassa e storico, invece di essere richiesti al momento della stampa: dopo
 * l'emissione un round-trip in più si vedrebbe (principio #1, performance
 * percepita), e l'auto-stampa deve partire senza attese.
 *
 * `cache()` di React deduplica la query nella stessa richiesta, così una
 * pagina che ha già bisogno di altri campi del business non paga due SELECT.
 */
async function fetchPrintProfile(
  businessId: string,
): Promise<ReceiptPrintProfile | null> {
  const [row] = await getDb()
    .select({
      businessName: businesses.businessName,
      vatNumber: businesses.vatNumber,
      address: businesses.address,
      city: businesses.city,
      province: businesses.province,
      zipCode: businesses.zipCode,
      receiptFooterNote: businesses.receiptFooterNote,
      // Il piano del titolare decide se il messaggio di cortesia si stampa.
      // Join invece di una seconda query: la FK è indicizzata e la pagina cassa
      // non deve pagare un round-trip in più per un arricchimento.
      plan: profiles.plan,
      trialStartedAt: profiles.trialStartedAt,
      planExpiresAt: profiles.planExpiresAt,
      referralBonusDays: profiles.referralBonusDays,
    })
    .from(businesses)
    .innerJoin(profiles, eq(businesses.profileId, profiles.id))
    .where(eq(businesses.id, businessId))
    .limit(1);

  // Ragione sociale e P.IVA sono nullable a schema (il business nasce
  // incompleto in onboarding). Senza di esse lo scontrino non è intestabile:
  // meglio non avere header — la stampa termica si disabilita e il bottone
  // ripiega sul PDF — che stamparne uno mutilo su un documento fiscale.
  if (!row?.businessName || !row.vatNumber) return null;

  return {
    header: {
      businessName: row.businessName,
      vatNumber: row.vatNumber,
      address: row.address,
      city: row.city,
      province: row.province,
      zipCode: row.zipCode,
    },
    footerNote: resolveReceiptFooterNote(row.receiptFooterNote, row),
  };
}

export const fetchReceiptPrintProfile: (
  businessId: string,
) => Promise<ReceiptPrintProfile | null> = cache(fetchPrintProfile);
