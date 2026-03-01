"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VatSelector } from "@/components/cassa/vat-selector";
import { updateCatalogItem } from "@/server/catalog-actions";
import type { VatCode } from "@/types/cassa";
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
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.defaultPrice ?? "");
  const [vatCode, setVatCode] = useState<VatCode>(item.defaultVatCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await updateCatalogItem({
      itemId: item.id,
      businessId,
      description,
      defaultPrice: price,
      defaultVatCode: vatCode,
    });

    setIsPending(false);

    if (result.error) {
      setError(result.error);
    } else {
      onSuccess();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica prodotto</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-description">Descrizione</Label>
            <Input
              id="edit-description"
              placeholder="es. Caffè espresso"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-price">
              Prezzo (€){" "}
              <span className="text-muted-foreground font-normal">
                — opzionale
              </span>
            </Label>
            <Input
              id="edit-price"
              type="number"
              step="0.01"
              min="0"
              placeholder="Lascia vuoto per inserirlo in cassa"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Aliquota IVA</Label>
            <VatSelector value={vatCode} onChange={setVatCode} />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvataggio…" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
