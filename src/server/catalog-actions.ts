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
import type {
  AddCatalogItemInput,
  CatalogActionResult,
  CatalogItem,
} from "@/types/catalogo";

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
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  const ownershipError = await checkBusinessOwnership(
    user.id,
    input.businessId,
  );
  if (ownershipError) return ownershipError;

  // Validate description
  if (!input.description?.trim()) {
    return { error: "La descrizione è obbligatoria." };
  }

  // Validate price
  const price = Number.parseFloat(input.defaultPrice);
  if (Number.isNaN(price) || price < 0) {
    return { error: "Il prezzo deve essere un numero non negativo." };
  }

  // Validate VAT code
  if (!VAT_CODES.includes(input.defaultVatCode)) {
    return { error: "Codice IVA non valido." };
  }

  const db = getDb();
  await db.insert(catalogItems).values({
    businessId: input.businessId,
    description: input.description.trim(),
    defaultPrice: input.defaultPrice,
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
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return { error: "Non autenticato." };
  }

  const ownershipError = await checkBusinessOwnership(user.id, businessId);
  if (ownershipError) return ownershipError;

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

  return {};
}
