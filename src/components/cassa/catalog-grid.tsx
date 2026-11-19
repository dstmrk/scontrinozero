"use client";

import { formatCurrency } from "@/lib/utils";
import type { CartLine } from "@/types/cassa";
import type { CatalogItem } from "@/types/catalogo";

/**
 * Unità di `item` già nel carrello. Una riga "è" di quel prodotto se ha la
 * stessa descrizione e la stessa IVA e, quando il prodotto ha un prezzo, lo
 * stesso prezzo: è il criterio con cui `addLine` fonde le righe, quindi il
 * badge conta esattamente le unità che il tap successivo incrementa. Un
 * prodotto senza prezzo conta le sue righe a qualsiasi importo digitato.
 */
export function cartQuantityFor(
  item: CatalogItem,
  lines: readonly CartLine[],
): number {
  const priceCents =
    item.defaultPrice === null
      ? null
      : Math.round(Number.parseFloat(item.defaultPrice) * 100);
  const total = lines
    .filter(
      (l) =>
        l.description === item.description &&
        l.vatCode === item.defaultVatCode &&
        (priceCents === null ||
          Math.round(l.grossUnitPrice * 100) === priceCents),
    )
    .reduce((sum, l) => sum + l.quantity, 0);
  // Quantità fino a 3 decimali (colonna numeric(10,3)): 0.1 + 0.2 resta 0.3.
  return Math.round(total * 1000) / 1000;
}

interface CatalogGridProps {
  readonly items: readonly CatalogItem[];
  readonly lines: readonly CartLine[];
  readonly onSelect: (item: CatalogItem) => void;
}

/**
 * Prodotti del catalogo come tile nella cassa: un tap aggiunge senza lasciare
 * la schermata di vendita. Con catalogo vuoto non occupa spazio, così chi
 * vende solo a importo libero vede la cassa di sempre.
 */
export function CatalogGrid({ items, lines, onSelect }: CatalogGridProps) {
  if (items.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Prodotti del catalogo">
      {items.map((item) => {
        const qty = cartQuantityFor(item, lines);
        const priceLabel =
          item.defaultPrice === null
            ? "Prezzo libero"
            : formatCurrency(item.defaultPrice);
        const label =
          qty > 0
            ? `${item.description}, ${priceLabel}, ${qty} nel carrello`
            : `${item.description}, ${priceLabel}`;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-label={label}
              onClick={() => onSelect(item)}
              className={`bg-card hover:bg-muted relative flex h-full min-h-16 w-full flex-col justify-between gap-1 rounded-lg border p-3 text-left transition-[transform,colors] active:scale-[0.97] ${qty > 0 ? "border-primary" : ""}`}
            >
              <span className="line-clamp-2 pr-6 text-sm leading-tight font-medium">
                {item.description}
              </span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {priceLabel}
              </span>
              {qty > 0 && (
                <span
                  data-testid="catalog-qty-badge"
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
                >
                  {qty}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
