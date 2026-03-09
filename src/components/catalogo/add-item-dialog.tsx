"use client";

import { CatalogItemDialog } from "./catalog-item-dialog";
import { addCatalogItem } from "@/server/catalog-actions";
import type { VatCode } from "@/types/cassa";

const DEFAULT_VAT: VatCode = "22";

interface AddItemDialogProps {
  readonly businessId: string;
  readonly onSuccess: () => void;
  readonly onClose: () => void;
}

export function AddItemDialog({
  businessId,
  onSuccess,
  onClose,
}: AddItemDialogProps) {
  return (
    <CatalogItemDialog
      title="Aggiungi prodotto"
      submitLabel="Aggiungi"
      pendingLabel="Aggiunta…"
      initialDescription=""
      initialPrice=""
      initialVatCode={DEFAULT_VAT}
      onSubmit={({ description, price, vatCode }) =>
        addCatalogItem({
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
