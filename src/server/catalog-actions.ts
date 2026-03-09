"use server";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import {
  checkBusinessOwnership,
  getAuthenticatedUser,
} from "@/lib/server-auth";
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

/** Autentica l'utente e verifica l'ownership del business. Ritorna null se OK. */
async function authenticateAndAuthorize(
  businessId: string,
): Promise<CatalogActionResult | null> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
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

    return items.map((item) => ({
      id: item.id,
      businessId: item.businessId,
      description: item.description,
      defaultPrice: item.defaultPrice,
      defaultVatCode: item.defaultVatCode as CatalogItem["defaultVatCode"],
      createdAt: item.createdAt,
    }));
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
 */
export async function addCatalogItem(
  input: AddCatalogItemInput,
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
  await db.insert(catalogItems).values({
    businessId: input.businessId,
    description: input.description.trim(),
    defaultPrice: validated.priceStr,
    defaultVatCode: input.defaultVatCode,
  });

  return {};
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

  await db
    .update(catalogItems)
    .set({
      description: input.description.trim(),
      defaultPrice: validated.priceStr,
      defaultVatCode: input.defaultVatCode,
    })
    .where(eq(catalogItems.id, input.itemId));

  return {};
}
