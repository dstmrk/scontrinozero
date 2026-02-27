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
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [vatCode, setVatCode] = useState<VatCode>(DEFAULT_VAT);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await addCatalogItem({
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
          <DialogTitle>Aggiungi prodotto</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="catalog-description">Descrizione</Label>
            <Input
              id="catalog-description"
              placeholder="es. Caffè espresso"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="catalog-price">Prezzo (€)</Label>
            <Input
              id="catalog-price"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
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
              {isPending ? "Aggiunta…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
