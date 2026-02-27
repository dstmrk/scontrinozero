/**
 * Tipi per il catalogo prodotti locale (Phase 4G).
 *
 * Il catalogo è locale al DB ScontrinoZero.
 * La sincronizzazione con la rubrica prodotti AdE è prevista in una fase futura.
 */

import type { VatCode } from "./cassa";

/** Un prodotto/servizio salvato nel catalogo dell'esercente */
export interface CatalogItem {
  id: string;
  businessId: string;
  description: string;
  /** Prezzo come stringa (Drizzle restituisce numeric come string) */
  defaultPrice: string;
  defaultVatCode: VatCode;
  createdAt: Date;
}

/** Input per la server action addCatalogItem */
export interface AddCatalogItemInput {
  businessId: string;
  description: string;
  /** Prezzo in euro come stringa, es: "12.50" */
  defaultPrice: string;
  defaultVatCode: VatCode;
}

/** Risultato generico delle server actions del catalogo */
export type CatalogActionResult = { error?: string };
