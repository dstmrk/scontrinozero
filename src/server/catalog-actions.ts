"use server";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
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
} from "@/lib/plans";
import { logger } from "@/lib/logger";
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
  const priceStr = defaultPrice === "" ? null : (defaultPrice ?? null);
  if (priceStr !== null) {
    const price = Number.parseFloat(priceStr);
    if (Number.isNaN(price) || price < 0) {
      return { error: "Il prezzo deve essere un numero non negativo." };
    }
  }
  if (!VAT_CODES.includes(defaultVatCode)) {
    return { error: "Codice IVA non valido." };
  }
  return { priceStr };
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
    logger.error({ err, businessId }, "getCatalogItems failed unexpectedly");
    return [];
  }
}

// ---------------------------------------------------------------------------
// addCatalogItem
// ---------------------------------------------------------------------------

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

  // Plan gate: Starter e trial hanno catalogo limitato.
  // getPlan e la conta articoli sono indipendenti → in parallelo.
  const db = getDb();
  const [planInfo, existingItems] = await Promise.all([
    getPlan(user.id),
    db
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(eq(catalogItems.businessId, input.businessId)),
  ]);

  if (
    !canAddCatalogItem(
      planInfo.plan,
      planInfo.trialStartedAt,
      existingItems.length,
      planInfo.planExpiresAt,
    )
  ) {
    // Trial scaduto o piano a pagamento scaduto oltre la grazia (webhook
    // perso): stesso messaggio sola-lettura della cassa (coerenza UX). Il
    // limite di 5 prodotti su Starter / trial attivo resta invece il suo
    // messaggio specifico — è un limite di piano corretto, non una scadenza.
    if (
      (planInfo.plan === "trial" && isTrialExpired(planInfo.trialStartedAt)) ||
      isPaidPlanExpired(planInfo.plan, planInfo.planExpiresAt)
    ) {
      return { error: TRIAL_EXPIRED_MESSAGE };
    }
    return {
      error: `Piano Starter: massimo ${STARTER_CATALOG_LIMIT} prodotti nel catalogo. Passa a Pro per catalogo illimitato.`,
    };
  }

  const [row] = await db
    .insert(catalogItems)
    .values({
      businessId: input.businessId,
      description: input.description.trim(),
      defaultPrice: validated.priceStr,
      defaultVatCode: input.defaultVatCode,
    })
    .returning();

  return { item: toCatalogItem(row) };
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
