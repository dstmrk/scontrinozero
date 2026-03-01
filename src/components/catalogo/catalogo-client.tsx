"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCatalogItems, deleteCatalogItem } from "@/server/catalog-actions";
import { VAT_LABELS } from "@/types/cassa";
import { formatCurrency } from "@/lib/utils";
import { AddItemDialog } from "./add-item-dialog";
import type { CatalogItem } from "@/types/catalogo";

interface CatalogoClientProps {
  readonly businessId: string;
  readonly initialData: CatalogItem[];
}

export function CatalogoClient({
  businessId,
  initialData,
}: CatalogoClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItem[]>(initialData);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refreshItems = () => {
    startTransition(async () => {
      const updated = await getCatalogItems(businessId);
      setItems(updated);
    });
  };

  const handleItemTap = (item: CatalogItem) => {
    if (item.defaultPrice !== null) {
      // Prezzo noto → aggiunge direttamente al carrello
      const params = new URLSearchParams({
        description: item.description,
        price: item.defaultPrice,
        vatCode: item.defaultVatCode,
      });
      router.push(`/dashboard/cassa?${params.toString()}`);
    } else {
      // Prezzo da definire → va al tastierino con descrizione e IVA pre-compilati
      const params = new URLSearchParams({
        prefillDescription: item.description,
        prefillVatCode: item.defaultVatCode,
      });
      router.push(`/dashboard/cassa?${params.toString()}`);
    }
  };

  const handleDeleteConfirm = async (itemId: string) => {
    setDeleteError(null);
    const result = await deleteCatalogItem(itemId, businessId);
    if (result.error) {
      setDeleteError(result.error);
    } else {
      setDeletingId(null);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    }
  };

  return (
    <div className="mx-auto max-w-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catalogo</h1>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      {/* Lista prodotti o empty state */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-12 text-center">
          <Package className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            Nessun prodotto nel catalogo.
            <br />
            Premi <strong>Aggiungi</strong> per iniziare.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center rounded-xl border px-4 py-3"
            >
              {/* Area tap → naviga alla cassa */}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setDeletingId(null);
                  handleItemTap(item);
                }}
              >
                <p className="truncate font-medium">{item.description}</p>
                <p className="text-muted-foreground text-sm">
                  {item.defaultPrice !== null
                    ? `${formatCurrency(Number.parseFloat(item.defaultPrice))} · `
                    : "Prezzo variabile · "}
                  <span>{VAT_LABELS[item.defaultVatCode]}</span>
                </p>
              </button>

              {/* Azioni eliminazione */}
              {deletingId === item.id ? (
                <div className="ml-2 flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteConfirm(item.id)}
                  >
                    Elimina
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeletingId(null);
                      setDeleteError(null);
                    }}
                  >
                    Annulla
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Elimina ${item.description}`}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                  onClick={() => setDeletingId(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteError && (
        <p role="alert" className="text-destructive text-sm">
          {deleteError}
        </p>
      )}

      {/* Dialog aggiunta prodotto */}
      {showAddDialog && (
        <AddItemDialog
          businessId={businessId}
          onSuccess={() => {
            setShowAddDialog(false);
            refreshItems();
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
