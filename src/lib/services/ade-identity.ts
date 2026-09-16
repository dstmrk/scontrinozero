/**
 * Lettura dei due verdetti sull'identita' registrata all'AdE, per le superfici
 * che la riga di `businesses` non ce l'hanno gia' in mano (REVIEW.md #106).
 *
 * **Perche' una lettura a parte, e non un campo in piu' su
 * `getOnboardingStatus`.** Quella funzione e' il lettore caldo del dashboard:
 * e' `cache()`-ata, la condividono il layout e cinque pagine, e il suo JOIN ha
 * portato una page navigation da sei query a una. Aggiungerle le dodici colonne
 * che servono qui la farebbe pagare a ogni render di ogni pagina, per un
 * banner che nel caso normale non si vede. La forma giusta e' quella che
 * `listStalePendingSales` ha gia' scelto per il finding #103: una query mirata,
 * dietro il `businessId` che lo status ha gia' in cache.
 *
 * **Degrada, non lancia** (regola 19). Questo vive nello shell del dashboard:
 * un throw sostituirebbe la cassa con l'error boundary di Next per un avviso
 * che e' informativo. Un fallimento significa "nessun avviso adesso", che e'
 * esattamente cio' che si vedeva prima che esistesse.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, adeCredentials } from "@/db/schema";
import {
  getAdeIdentityMismatches,
  type AdeIdentityMismatches,
} from "@/lib/business-identity";
import { logger } from "@/lib/logger";

const SILENZIO: AdeIdentityMismatches = {
  denominazione: null,
  sedeLegale: null,
};

export async function loadAdeIdentityMismatches(
  businessId: string,
): Promise<AdeIdentityMismatches> {
  try {
    const [row] = await getDb()
      .select({
        businessName: businesses.businessName,
        adeDenominazione: businesses.adeDenominazione,
        address: businesses.address,
        streetNumber: businesses.streetNumber,
        zipCode: businesses.zipCode,
        city: businesses.city,
        province: businesses.province,
        adeIndirizzo: businesses.adeIndirizzo,
        adeNumeroCivico: businesses.adeNumeroCivico,
        adeCap: businesses.adeCap,
        adeComune: businesses.adeComune,
        adeProvincia: businesses.adeProvincia,
        utenzaPiva: adeCredentials.utenzaPiva,
      })
      .from(businesses)
      // LEFT JOIN: un business senza riga credenziali arriva con utenzaPiva
      // null e viene respinto dai predicati, come un'utenza "me stesso".
      .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
      .where(eq(businesses.id, businessId))
      .limit(1);

    if (!row) return SILENZIO;

    return getAdeIdentityMismatches(row, row.utenzaPiva);
  } catch (err) {
    logger.warn(
      { err, businessId },
      "Lettura dell'identità AdE fallita, avviso non mostrato",
    );
    return SILENZIO;
  }
}
