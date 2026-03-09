"use client";

import { CatalogItemDialog } from "./catalog-item-dialog";
import { updateCatalogItem } from "@/server/catalog-actions";
import type { CatalogItem } from "@/types/catalogo";

interface EditItemDialogProps {
  readonly businessId: string;
  readonly item: CatalogItem;
  readonly onSuccess: () => void;
  readonly onClose: () => void;
}

export function EditItemDialog({
  businessId,
  item,
  onSuccess,
  onClose,
}: EditItemDialogProps) {
  return (
    <CatalogItemDialog
      title="Modifica prodotto"
      submitLabel="Salva"
      pendingLabel="Salvataggio…"
      initialDescription={item.description}
      initialPrice={item.defaultPrice ?? ""}
      initialVatCode={item.defaultVatCode}
      onSubmit={({ description, price, vatCode }) =>
        updateCatalogItem({
          itemId: item.id,
          businessId,
          description,
          defaultPrice: price,
          defaultVatCode: vatCode,
        })
      }
      onSuccess={onSuccess}
      onClose={onClose}
    />
  );
}
