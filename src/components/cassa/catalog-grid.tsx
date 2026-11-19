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
 * la schermata di vendita. Tile compatte su una riga (descrizione troncata,
 * per intero nel `title` e nell'etichetta accessibile): lo spazio verticale
 * serve al carrello, che sta sotto la griglia. Con catalogo vuoto non occupa
 * spazio, così chi vende solo a importo libero vede la cassa di sempre.
 * `touch-action: manipulation` come sui tasti del tastierino: "due caffè" è
 * un doppio tap rapido, e iOS Safari potrebbe leggerlo come zoom.
 */
export function CatalogGrid({ items, lines, onSelect }: CatalogGridProps) {
  if (items.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Prodotti del catalogo">
      {items.map((item) => {
        const qty = cartQuantityFor(item, lines);
        const price =
          item.defaultPrice === null ? null : formatCurrency(item.defaultPrice);
        const spokenPrice = price ?? "Prezzo libero";
        const label =
          qty > 0
            ? `${item.description}, ${spokenPrice}, ${qty} nel carrello`
            : `${item.description}, ${spokenPrice}`;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-label={label}
              title={item.description}
              onClick={() => onSelect(item)}
              className={`bg-card hover:bg-muted relative flex h-11 w-full [touch-action:manipulation] items-center gap-2 rounded-lg border px-3 text-left transition-[transform,colors] active:scale-[0.97] ${qty > 0 ? "border-primary" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.description}
              </span>
              <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                {price ?? "libero"}
              </span>
              {qty > 0 && (
                <span
                  data-testid="catalog-qty-badge"
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground absolute -top-2 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
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
