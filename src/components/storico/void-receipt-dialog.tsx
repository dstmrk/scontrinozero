"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { voidReceipt } from "@/server/void-actions";
import type { ReceiptListItem, VoidReceiptResult } from "@/types/storico";

interface VoidReceiptDialogProps {
  receipt: ReceiptListItem;
  businessId: string;
  onClose: () => void;
  onSuccess: (result: VoidReceiptResult, originalId: string) => void;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: string): string {
  return `€ ${parseFloat(amount).toFixed(2).replace(".", ",")}`;
}

function formatVat(vatCode: string): string {
  if (vatCode.startsWith("N")) return vatCode;
  return `${vatCode}% IVA`;
}

/** Tre stati del dialog:
 *  detail        — mostra le righe e i bottoni principali
 *  confirmingVoid — chiede conferma dell'annullo con il warning
 *  voidSuccess   — annullo completato con successo
 */
type DialogView = "detail" | "confirmingVoid" | "voidSuccess";

export function VoidReceiptDialog({
  receipt,
  businessId,
  onClose,
  onSuccess,
}: VoidReceiptDialogProps) {
  const [view, setView] = useState<DialogView>("detail");
  // Stable idempotency key: generated once per dialog open, reused on retries
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  /** Solo i SALE non ancora annullati possono essere annullati. */
  const canVoid = receipt.status === "ACCEPTED";

  const mutation = useMutation({
    mutationFn: async () => {
      return voidReceipt({
        documentId: receipt.id,
        idempotencyKey,
        businessId,
      });
    },
    onSuccess: (result) => {
      if (result.error) {
        // Error is shown inline — mutation still "succeeds" from React Query's POV
        return;
      }
      setView("voidSuccess");
      onSuccess(result, receipt.id);
    },
  });

  const subtotal = receipt.lines.reduce(
    (sum, l) => sum + parseFloat(l.grossUnitPrice) * parseFloat(l.quantity),
    0,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {view === "voidSuccess" ? (
          // ── Stato 3: annullo avvenuto ──────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle className="text-green-600">
                Annullo confermato
              </DialogTitle>
              <DialogDescription>
                Lo scontrino è stato annullato con successo.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md bg-green-50 p-4 text-sm">
              <p className="font-medium text-green-800">
                Progressivo annullo:{" "}
                <span className="font-mono">
                  {mutation.data?.adeProgressive ?? "—"}
                </span>
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Chiudi</Button>
            </DialogFooter>
          </>
        ) : view === "confirmingVoid" ? (
          // ── Stato 2: conferma annullo ──────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle>Conferma annullo</DialogTitle>
              <DialogDescription>
                Scontrino {receipt.adeProgressive ?? receipt.id.slice(0, 8)} —{" "}
                {formatCurrency(receipt.total)}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <strong>⚠️ Attenzione:</strong> L&apos;annullo è irreversibile. Lo
              scontrino verrà trasmesso all&apos;Agenzia delle Entrate come
              documento di annullo.
            </div>

            {/* Error: da server action (result.error) o eccezione imprevista */}
            {(mutation.data?.error ?? mutation.isError) && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {mutation.data?.error ?? "Errore imprevisto. Riprova."}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Annullamento…" : "Annulla scontrino"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setView("detail")}
                disabled={mutation.isPending}
              >
                Chiudi senza annullare
              </Button>
            </DialogFooter>
          </>
        ) : (
          // ── Stato 1: dettaglio scontrino ───────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle>
                Scontrino {receipt.adeProgressive ?? receipt.id.slice(0, 8)}
              </DialogTitle>
              <DialogDescription>
                {formatDate(receipt.createdAt)} — Totale:{" "}
                {formatCurrency(receipt.total)}
              </DialogDescription>
            </DialogHeader>

            {/* Lines */}
            <div className="divide-y rounded-md border">
              {receipt.lines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate font-medium">{line.description}</p>
                    <p className="text-muted-foreground">
                      {parseFloat(line.quantity).toLocaleString("it-IT")} ×{" "}
                      {formatCurrency(line.grossUnitPrice)} —{" "}
                      {formatVat(line.vatCode)}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium">
                    {formatCurrency(
                      String(
                        parseFloat(line.grossUnitPrice) *
                          parseFloat(line.quantity),
                      ),
                    )}
                  </p>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                <span>Totale</span>
                <span>{formatCurrency(String(subtotal))}</span>
              </div>
            </div>

            {/* Bottoni: Annulla scontrino | Invia ricevuta | Chiudi */}
            <DialogFooter className="gap-2">
              {canVoid && (
                <Button
                  variant="destructive"
                  onClick={() => setView("confirmingVoid")}
                >
                  Annulla scontrino
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => window.open(`/r/${receipt.id}`, "_blank")}
              >
                <Send className="mr-2 h-4 w-4" />
                Invia ricevuta
              </Button>
              <Button variant="outline" onClick={onClose}>
                Chiudi
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
