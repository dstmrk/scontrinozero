"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses, catalogItems } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
import { authErrorResult } from "@/lib/auth-errors";
import {
  canAddCatalogItem,
  getPlan,
  isPaidPlanExpired,
  isTrialExpired,
  STARTER_CATALOG_LIMIT,
  TRIAL_EXPIRED_MESSAGE,
  type PlanInfo,
} from "@/lib/plans";
import { logger } from "@/lib/logger";
import { isValidUuid } from "@/lib/uuid";
import { VAT_CODES } from "@/types/cassa";
import type { VatCode } from "@/types/cassa";
import type {
  AddCatalogItemInput,
  CatalogActionResult,
  CatalogItem,
  UpdateCatalogItemInput,
} from "@/types/catalogo";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Riga DB del catalogo → CatalogItem del dominio (forma condivisa). */
function toCatalogItem(row: {
  id: string;
  businessId: string;
  description: string;
  defaultPrice: string | null;
  defaultVatCode: string;
  createdAt: Date;
}): CatalogItem {
  return {
    id: row.id,
    businessId: row.businessId,
    description: row.description,
    defaultPrice: row.defaultPrice,
    defaultVatCode: row.defaultVatCode as CatalogItem["defaultVatCode"],
    createdAt: row.createdAt,
  };
}

/** Autentica l'utente e verifica l'ownership del business. Ritorna null se OK. */
async function authenticateAndAuthorize(
  businessId: string,
): Promise<CatalogActionResult | null> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "authenticateAndAuthorize");
  }
  return checkBusinessOwnership(user.id, businessId);
}

// Criterio fiscale allineato a `saleLineSchema` (receipt-schema.ts) e alla
// colonna numeric(10,2): max 6 cifre intere + separatore decimale opzionale
// (punto o virgola) con max 2 decimali. `parseFloat` accettava invece prefissi
// numerici ("12abc" → 12), valori speciali ("Infinity", "NaN") e notazione
// esponenziale ("1e7"), lasciando poi esplodere l'INSERT su numeric(10,2) con
// Postgres 22P02 (error boundary invece di errore inline — regola 9/19).
const PRICE_REGEX = /^\d{1,6}([.,]\d{1,2})?$/;
const PRICE_MAX_CENTS = 99_999_999; // 999999.99 in centesimi

/**
 * Valida e normalizza il prezzo di catalogo al boundary (regola 9).
 * Ritorna `{ priceStr }` con la forma canonica col punto (mai l'input raw),
 * `null` se il prezzo è assente, o `{ error }` se degenere/fuori range.
 */
function normalizePrice(
  defaultPrice: string | null,
): { priceStr: string | null } | { error: string } {
  const raw = defaultPrice === "" ? null : (defaultPrice ?? null);
  if (raw === null) return { priceStr: null };

  const normalized = raw.trim().replace(",", ".");
  if (!PRICE_REGEX.test(normalized)) {
    return { error: "Il prezzo deve essere un numero non negativo." };
  }
  // Range check sui centesimi interi per evitare imprecisioni IEEE-754 sul tetto.
  const cents = Math.round(Number.parseFloat(normalized) * 100);
  if (cents < 0 || cents > PRICE_MAX_CENTS) {
    return { error: "Il prezzo deve essere un numero non negativo." };
  }
  return { priceStr: normalized };
}

/** Valida descrizione, prezzo e aliquota IVA. Ritorna { priceStr } se OK. */
function validateItemInput(
  description: string,
  defaultPrice: string | null,
  defaultVatCode: VatCode,
): { priceStr: string | null } | { error: string } {
  if (!description.trim()) {
    return { error: "La descrizione è obbligatoria." };
  }
  if (description.trim().length > 200) {
    return { error: "La descrizione non può superare 200 caratteri." };
  }
  const priceResult = normalizePrice(defaultPrice);
  if ("error" in priceResult) return priceResult;
  if (!VAT_CODES.includes(defaultVatCode)) {
    return { error: "Codice IVA non valido." };
  }
  return { priceStr: priceResult.priceStr };
}

// ---------------------------------------------------------------------------
// getCatalogItems
// ---------------------------------------------------------------------------

/**
 * Restituisce i prodotti del catalogo per un business, ordinati per descrizione.
 * Restituisce lista vuota in caso di errore auth/ownership (fail-safe).
 */
export async function getCatalogItems(
  businessId: string,
): Promise<CatalogItem[]> {
  // Guard UUID (regola 9): un businessId malformato farebbe lanciare 22P02 a
  // Postgres in checkBusinessOwnership → degradiamo a lista vuota senza toccare
  // il DB (input prevedibile, nessun rumore Sentry — regola 20).
  if (!isValidUuid(businessId)) return [];

  try {
    const user = await getAuthenticatedUser();
    const ownershipError = await checkBusinessOwnership(user.id, businessId);
    if (ownershipError) return [];

    const db = getDb();
    const items = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.businessId, businessId))
      .orderBy(asc(catalogItems.description));

    return items.map(toCatalogItem);
  } catch (err) {
    // warn, non error: questa classe di fallimento è dominata da input utente
    // prevedibile (regola 20), non deve generare issue Sentry.
    logger.warn({ err, businessId }, "getCatalogItems failed unexpectedly");
    return [];
  }
}

// ---------------------------------------------------------------------------
// addCatalogItem
// ---------------------------------------------------------------------------

/**
 * Messaggio d'errore quando `canAddCatalogItem` nega l'aggiunta.
 *
 * Trial scaduto o piano a pagamento scaduto oltre la grazia (webhook perso):
 * stesso messaggio sola-lettura della cassa (coerenza UX). Il limite di
 * STARTER_CATALOG_LIMIT prodotti su Starter / trial attivo resta invece il suo
 * messaggio specifico — è un limite di piano corretto, non una scadenza.
 */
function catalogGateError(planInfo: PlanInfo): string {
  if (
    (planInfo.plan === "trial" && isTrialExpired(planInfo.trialStartedAt)) ||
    isPaidPlanExpired(planInfo.plan, planInfo.planExpiresAt)
  ) {
    return TRIAL_EXPIRED_MESSAGE;
  }
  return `Piano Starter: massimo ${STARTER_CATALOG_LIMIT} prodotti nel catalogo. Passa a Pro per catalogo illimitato.`;
}

/**
 * Aggiunge un prodotto al catalogo del business.
 * Limita a STARTER_CATALOG_LIMIT prodotti per piano Starter/trial.
 */
export async function addCatalogItem(
  input: AddCatalogItemInput,
): Promise<CatalogActionResult> {
  // Auth + ownership inline (serve user.id per il plan gate)
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (err) {
    return authErrorResult(err, "addCatalogItem");
  }

  // Guard UUID (regola 9) prima di qualunque accesso al DB.
  if (!isValidUuid(input.businessId)) {
    return { error: "Identificativo non valido." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  const validated = validateItemInput(
    input.description,
    input.defaultPrice,
    input.defaultVatCode,
  );
  if ("error" in validated) return validated;

  const db = getDb();
  // getPlan resta FUORI dalla transazione: è cache-ato per-richiesta e non deve
  // allungare la finestra del lock.
  const planInfo = await getPlan(user.id);

  const insertValues = {
    businessId: input.businessId,
    description: input.description.trim(),
    defaultPrice: validated.priceStr,
    defaultVatCode: input.defaultVatCode,
  };

  // Piani a catalogo illimitato (pro/unlimited/developer): il predicato passa
  // anche a currentCount === STARTER_CATALOG_LIMIT, quindi nessun conteggio può
  // cambiarne l'esito. Saltare del tutto la query: prima si caricavano tutti
  // gli UUID del catalogo (5-10k righe su un Pro) per un limite inesistente.
  if (
    canAddCatalogItem(
      planInfo.plan,
      planInfo.trialStartedAt,
      STARTER_CATALOG_LIMIT,
      planInfo.planExpiresAt,
    )
  ) {
    const [row] = await db
      .insert(catalogItems)
      .values(insertValues)
      .returning();
    return { item: toCatalogItem(row) };
  }

  // Il limite si applica: conteggio + INSERT serializzati per business con
  // SELECT ... FOR UPDATE sulla riga businesses (stesso pattern di
  // createApiKey). Senza lock due addCatalogItem concorrenti su un Starter a 4
  // prodotti leggono entrambe 4 < 5, passano entrambe il gate e inseriscono.
  return db.transaction(async (tx) => {
    await tx
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, input.businessId))
      .for("update");

    const [{ count: currentCount }] = await tx
      .select({ count: count() })
      .from(catalogItems)
      .where(eq(catalogItems.businessId, input.businessId));

    if (
      !canAddCatalogItem(
        planInfo.plan,
        planInfo.trialStartedAt,
        Number(currentCount),
        planInfo.planExpiresAt,
      )
    ) {
      return { error: catalogGateError(planInfo) };
    }

    const [row] = await tx
      .insert(catalogItems)
      .values(insertValues)
      .returning();
    return { item: toCatalogItem(row) };
  });
}

// ---------------------------------------------------------------------------
// deleteCatalogItem
// ---------------------------------------------------------------------------

/**
 * Elimina un prodotto dal catalogo.
 * Verifica che il prodotto appartenga al business dell'utente autenticato.
 */
export async function deleteCatalogItem(
  itemId: string,
  businessId: string,
): Promise<CatalogActionResult> {
  // Guard UUID (regola 9): sia itemId sia businessId finiscono in eq() su
  // colonne uuid → un valore malformato lancerebbe 22P02. Blocca prima di
  // qualunque query DB.
  if (!isValidUuid(itemId) || !isValidUuid(businessId)) {
    return { error: "Identificativo non valido." };
  }

  const authError = await authenticateAndAuthorize(businessId);
  if (authError) return authError;

  const db = getDb();

  // Verify item belongs to this business (prevents IDOR)
  const [item] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(
      and(eq(catalogItems.id, itemId), eq(catalogItems.businessId, businessId)),
    )
    .limit(1);

  if (!item) {
    return { error: "Prodotto non trovato." };
  }

  await db.delete(catalogItems).where(eq(catalogItems.id, itemId));

  logger.info({ itemId, businessId }, "Catalog item deleted");

  return {};
}

// ---------------------------------------------------------------------------
// updateCatalogItem
// ---------------------------------------------------------------------------

/**
 * Aggiorna un prodotto nel catalogo.
 * Verifica che il prodotto appartenga al business dell'utente autenticato.
 */
export async function updateCatalogItem(
  input: UpdateCatalogItemInput,
): Promise<CatalogActionResult> {
  // Guard UUID (regola 9): itemId + businessId in eq() su colonne uuid.
  if (!isValidUuid(input.itemId) || !isValidUuid(input.businessId)) {
    return { error: "Identificativo non valido." };
  }

  const authError = await authenticateAndAuthorize(input.businessId);
  if (authError) return authError;

  const validated = validateItemInput(
    input.description,
    input.defaultPrice,
    input.defaultVatCode,
  );
  if ("error" in validated) return validated;

  const db = getDb();

  const [item] = await db
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.id, input.itemId),
        eq(catalogItems.businessId, input.businessId),
      ),
    )
    .limit(1);

  if (!item) {
    return { error: "Prodotto non trovato." };
  }

  const [row] = await db
    .update(catalogItems)
    .set({
      description: input.description.trim(),
      defaultPrice: validated.priceStr,
      defaultVatCode: input.defaultVatCode,
    })
    .where(eq(catalogItems.id, input.itemId))
    .returning();

  // Race: la riga potrebbe essere stata eliminata tra la verifica e l'UPDATE
  // (0 righe → returning vuoto). Degradare a successo senza item invece di
  // crashare (regola 19).
  if (!row) return {};

  return { item: toCatalogItem(row) };
}
