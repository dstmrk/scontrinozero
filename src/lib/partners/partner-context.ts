import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { partners, profiles } from "@/db/schema";
import { logger } from "@/lib/logger";

import { extractPartnerSlug } from "./partner-host";

/**
 * Contesto partner risolto per la richiesta corrente.
 * `referralCode` è quello del profilo del partner (join), forzato in fase di
 * registrazione sul subdomain.
 */
export interface PartnerContext {
  slug: string;
  label: string;
  referralCode: string;
}

/**
 * Lookup partner attivo per slug, joinato a `profiles` per il referral code
 * (single source of truth). Cache per-richiesta (`react/cache`): layout e
 * registrazione che chiamano nello stesso render condividono una sola query.
 *
 * Degrada a `null` su errore DB invece di lanciare (regola 19): la UI mostra
 * il branding di default senza far scattare l'error boundary. `warn`, non
 * `error`: è una read cosmetica degradabile, non vogliamo rumore Sentry
 * (regola 20).
 */
export const getPartnerBySlug = cache(
  async (slug: string): Promise<PartnerContext | null> => {
    try {
      const db = getDb();
      const [row] = await db
        .select({
          slug: partners.slug,
          label: partners.label,
          referralCode: profiles.referralCode,
        })
        .from(partners)
        .innerJoin(profiles, eq(partners.referrerProfileId, profiles.id))
        .where(and(eq(partners.slug, slug), eq(partners.active, true)))
        .limit(1);
      return row ?? null;
    } catch (err) {
      logger.warn(
        { err, slug, errorClass: "partner_lookup_failed" },
        "Partner lookup failed",
      );
      return null;
    }
  },
);

/**
 * Risolve il partner dalla richiesta corrente leggendo l'header `Host`
 * (`next/headers`, async in Next 16). Ritorna `null` fuori da un subdomain
 * partner (dominio app/marketing standard) o se la richiesta non ha header
 * (chiamata sintetica / build).
 */
export const getPartnerContext = cache(
  async (): Promise<PartnerContext | null> => {
    let host: string | null;
    try {
      host = (await headers()).get("host");
    } catch {
      return null;
    }
    const slug = extractPartnerSlug(host);
    if (!slug) return null;
    return getPartnerBySlug(slug);
  },
);
