/**
 * La riga di `businesses` che i predicati sull'identita' AdE leggono, e i due
 * verdetti che ne derivano (REVIEW.md #106).
 *
 * **Perche' la query sta qui e non nei due chiamanti.** La leggono in due:
 * `readAdeIdentityContext` in `profile-actions.ts`, per le action che
 * allineano, e `AdeIdentitySection` nello shell del dashboard, per mostrare
 * l'avviso. Sono tredici colonne scelte insieme ai predicati: scritte due
 * volte, la seconda smette di stare dietro alla prima il giorno che una
 * colonna si aggiunge, e il bug e' un verdetto calcolato su un campo sempre
 * `undefined`. Un posto solo sa quali colonne servono.
 *
 * **Perche' NON e' anche un campo di `getOnboardingStatus`.** Quella funzione
 * e' il lettore caldo del dashboard: e' `cache()`-ata, la condividono il
 * layout e cinque pagine, e il suo JOIN ha portato una page navigation da sei
 * query a una. Aggiungerle queste colonne le farebbe pagare a ogni render di
 * ogni pagina, per un avviso che nel caso normale non si vede. La forma giusta
 * e' quella che `listStalePendingSales` ha gia' scelto per il finding #103:
 * una query mirata dietro il `businessId` che lo status ha gia' in cache.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, adeCredentials } from "@/db/schema";
import {
  getAdeIdentityMismatches,
  type AdeIdentityMismatches,
  type BusinessIdentityRow,
} from "@/lib/business-identity";
import { logger } from "@/lib/logger";

export type AdeIdentityRow = BusinessIdentityRow & {
  utenzaPiva: string | null;
};

/**
 * Legge la riga, o `null` se il business non c'e'. **Propaga** un errore DB:
 * come degradare lo decide chi chiama, e i due chiamanti lo fanno in modi
 * diversi — la server action deve poter dire all'utente che non ha funzionato,
 * lo shell del dashboard deve solo tacere.
 */
export async function readAdeIdentityRow(
  businessId: string,
): Promise<AdeIdentityRow | null> {
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
    // LEFT JOIN e non INNER: un business senza riga credenziali non e' un
    // errore, e' un onboarding a meta'. Arriva con utenzaPiva null e viene
    // respinto dai predicati, come un'utenza "me stesso".
    .leftJoin(adeCredentials, eq(adeCredentials.businessId, businesses.id))
    .where(eq(businesses.id, businessId))
    .limit(1);

  return row ?? null;
}

const SILENZIO: AdeIdentityMismatches = {
  denominazione: null,
  sedeLegale: null,
};

/**
 * I due verdetti per le superfici che la riga non ce l'hanno gia' in mano.
 *
 * **Degrada, non lancia** (regola 19). Questo gira nello shell del dashboard:
 * un throw sostituirebbe la cassa con l'error boundary di Next per un avviso
 * che e' informativo. Un fallimento significa "nessun avviso adesso", che e'
 * esattamente cio' che si vedeva prima che esistesse.
 */
export async function loadAdeIdentityMismatches(
  businessId: string,
): Promise<AdeIdentityMismatches> {
  try {
    const row = await readAdeIdentityRow(businessId);
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
