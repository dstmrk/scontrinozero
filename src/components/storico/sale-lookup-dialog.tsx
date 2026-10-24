"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findSaleForReturn } from "@/server/storico-actions";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import type { ReceiptListItem } from "@/types/storico";
import { ReturnReceiptPanel } from "./return-receipt-panel";

interface SaleLookupDialogProps {
  readonly businessId: string;
  readonly printProfile: ReceiptPrintProfile | null;
  readonly onClose: () => void;
  /** Reso registrato: il parent rilegge la vendita, se è nell'elenco. */
  readonly onReturned: (saleId: string) => void;
}

/**
 * Reso da scontrino (issue #1099): il cliente porta lo scontrino, si digitano
 * il numero stampato dopo «DOCUMENTO N.» e la data, e si arriva al reso di
 * quella vendita. Serve soprattutto al collaboratore, che nello storico vede
 * solo le proprie vendite ma rende anche quelle degli altri membri.
 */
export function SaleLookupDialog({
  businessId,
  printProfile,
  onClose,
  onReturned,
}: SaleLookupDialogProps) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [sale, setSale] = useState<ReceiptListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await findSaleForReturn(businessId, { number, date });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSale(result.item);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-lg">
        {sale ? (
          <ReturnReceiptPanel
            receipt={sale}
            businessId={businessId}
            printProfile={printProfile}
            onBack={() => setSale(null)}
            onClose={onClose}
            onReturned={onReturned}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Reso da scontrino</DialogTitle>
              <DialogDescription>
                Cerca la vendita col numero stampato dopo «DOCUMENTO N.» e con
                la data dello scontrino.
              </DialogDescription>
            </DialogHeader>

            <div>
              <label
                htmlFor="saleNumber"
                className="mb-1 block text-xs font-medium"
              >
                Numero documento
              </label>
              <Input
                id="saleNumber"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="DCW2026/5111-2188"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label
                htmlFor="saleDate"
                className="mb-1 block text-xs font-medium"
              >
                Data dello scontrino
              </label>
              <Input
                id="saleDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? "Ricerca…" : "Cerca"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
