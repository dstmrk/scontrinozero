"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, Share2, Check, Copy, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceiptQrCode } from "@/components/receipts/receipt-qr-code";
import { PrintReceiptButton } from "@/components/printing/print-receipt-button";
import { usePrinter } from "@/hooks/use-printer";
import { readPrinterPreferences } from "@/lib/printing/printer-preferences";
import type { CartLine, PaymentMethod } from "@/types/cassa";
import type { PrintableReceipt } from "@/lib/printing/types";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";

interface ReceiptSuccessProps {
  readonly documentId?: string;
  readonly adeProgressive?: string;
  readonly adeTransactionId?: string;
  /**
   * Istante di registrazione AdE del documento (ISO). La carta non deve usare
   * `new Date()`, e nemmeno il `createdAt` della riga: quello precede la
   * risposta AdE della latenza del round-trip.
   */
  readonly adeRegisteredAt?: string;
  /**
   * Dati per la stampa su termica. Opzionali con default innocui: se mancano,
   * `printableReceipt` resta null e il bottone "Stampa" ripiega sul PDF —
   * esattamente il comportamento voluto quando non c'è abbastanza per
   * comporre un documento fiscale.
   */
  readonly lines?: readonly CartLine[];
  readonly paymentMethod?: PaymentMethod;
  readonly lotteryCode?: string | null;
  readonly printProfile?: ReceiptPrintProfile | null;
  readonly onNewReceipt: () => void;
}

export function ReceiptSuccess({
  documentId,
  adeProgressive,
  adeTransactionId,
  adeRegisteredAt,
  lines = [],
  paymentMethod = "PC",
  lotteryCode = null,
  printProfile = null,
  onNewReceipt,
}: ReceiptSuccessProps) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const printer = usePrinter();
  const autoPrintDone = useRef(false);

  /**
   * Scontrino stampabile. Serve l'intestazione dell'esercente e il progressivo
   * AdE: senza, resta comunque la corsia PDF del bottone.
   */
  const printableReceipt = useMemo<PrintableReceipt | null>(() => {
    if (!printProfile || !adeProgressive || lines.length === 0) return null;
    return {
      kind: "SALE",
      header: printProfile.header,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: String(line.quantity),
        grossUnitPrice: String(line.grossUnitPrice),
        vatCode: line.vatCode,
      })),
      paymentMethod,
      // Fallback su "adesso" solo se il server non ha restituito la data:
      // l'orario sarebbe di pochi secondi diverso, meglio di nessuna stampa.
      adeRegisteredAt: adeRegisteredAt ? new Date(adeRegisteredAt) : new Date(),
      adeProgressive,
      lotteryCode,
      // Messaggio di cortesia (Pro), gia' passato per il gate di piano lato
      // server: qui `null` significa solo "non stampare nulla".
      footerNote: printProfile.footerNote,
      publicUrl: documentId
        ? `${globalThis.location.origin}/r/${documentId}`
        : null,
    };
  }, [
    printProfile,
    adeProgressive,
    lines,
    paymentMethod,
    adeRegisteredAt,
    lotteryCode,
    documentId,
  ]);

  // Auto-stampa: parte DOPO che la schermata di successo è renderizzata e non
  // la blocca mai: se la stampante non risponde, l'utente vede comunque lo
  // scontrino emesso e ha il bottone "Stampa" per riprovare. Un fallimento di
  // stampa non è mai un fallimento di emissione.
  //
  // È un colpo solo, sparato alla prima valutazione con uno scontrino
  // stampabile: vale per la stampante GIÀ collegata al momento dell'emissione.
  // Una connessione successiva è un'azione esplicita dell'utente ("Ricollega e
  // stampa"), che la stampa la ottiene già dal bottone — se l'effect restasse
  // armato, quel tap produrrebbe due copie cartacee dello stesso documento.
  useEffect(() => {
    if (autoPrintDone.current || !printableReceipt) return;
    autoPrintDone.current = true;
    if (printer.status !== "connected") return;
    if (!readPrinterPreferences().autoPrint) return;
    void printer.print(printableReceipt);
  }, [printableReceipt, printer]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const now = new Date().toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const handleShare = async () => {
    if (!documentId) return;
    const url = `${globalThis.location.origin}/r/${documentId}`;

    if (navigator.share) {
      try {
        await navigator.share({ url, title: "La tua ricevuta" });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API non disponibile
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-8 text-center">
      <CheckCircle2 className="text-primary h-16 w-16" aria-hidden="true" />

      <div className="space-y-1">
        <h2 className="text-2xl font-bold">Scontrino emesso</h2>
        <p className="text-muted-foreground text-sm">{now}</p>
      </div>

      {(adeProgressive ?? adeTransactionId) && (
        <div className="bg-muted w-full rounded-xl px-4 py-3 text-left">
          {adeProgressive && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Identificativo AdE
              </span>
              <span className="font-mono text-sm font-semibold">
                {adeProgressive}
              </span>
            </div>
          )}
          {adeTransactionId && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                ID transazione
              </span>
              <span className="font-mono text-sm font-semibold">
                {adeTransactionId}
              </span>
            </div>
          )}
        </div>
      )}

      {documentId && (
        <>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleShare}
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4 text-green-600" />
                <span className="text-green-600">Link copiato!</span>
              </>
            ) : (
              <>
                <Share2 className="mr-2 h-4 w-4" />
                Invia ricevuta
                <Copy className="text-muted-foreground ml-auto h-3.5 w-3.5" />
              </>
            )}
          </Button>

          <PrintReceiptButton
            receipt={printableReceipt}
            pdfHref={`/api/documents/${documentId}/pdf`}
            className="w-full"
          />

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setQrOpen(true)}
          >
            <QrCode className="mr-2 h-4 w-4" />
            Mostra QR code
          </Button>

          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Ricevuta</DialogTitle>
                <DialogDescription>
                  Mostra questo QR code all&apos;acquirente per fargli aprire la
                  ricevuta.
                </DialogDescription>
              </DialogHeader>
              <ReceiptQrCode
                url={`${globalThis.location.origin}/r/${documentId}`}
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      <Button type="button" size="lg" className="w-full" onClick={onNewReceipt}>
        Nuovo scontrino
      </Button>
    </div>
  );
}
