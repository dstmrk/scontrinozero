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
import type { VatCode } from "@/types/cassa";

interface CatalogItemDialogProps {
  readonly title: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly initialDescription: string;
  readonly initialPrice: string;
  readonly initialVatCode: VatCode;
  readonly onSubmit: (values: {
    description: string;
    price: string;
    vatCode: VatCode;
  }) => Promise<{ error?: string }>;
  readonly onSuccess: () => void;
  readonly onClose: () => void;
}

export function CatalogItemDialog({
  title,
  submitLabel,
  pendingLabel,
  initialDescription,
  initialPrice,
  initialVatCode,
  onSubmit,
  onSuccess,
  onClose,
}: CatalogItemDialogProps) {
  const [description, setDescription] = useState(initialDescription);
  const [price, setPrice] = useState(initialPrice);
  const [vatCode, setVatCode] = useState<VatCode>(initialVatCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const result = await onSubmit({ description, price, vatCode });

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
          <DialogTitle>{title}</DialogTitle>
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
            <Label htmlFor="catalog-price">
              Prezzo (€){" "}
              <span className="text-muted-foreground font-normal">
                — opzionale
              </span>
            </Label>
            <Input
              id="catalog-price"
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
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
