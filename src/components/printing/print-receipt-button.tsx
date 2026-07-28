"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePrinter } from "@/hooks/use-printer";
import { printErrorMessage } from "@/lib/printing/error-messages";
import type { PrintableReceipt } from "@/lib/printing/types";

interface PrintReceiptButtonProps {
  /**
   * Scontrino da stampare. `null` quando i dati non bastano (es. intestazione
   * esercente incompleta): resta comunque la corsia PDF.
   */
  readonly receipt: PrintableReceipt | null;
  /** URL del PDF 58mm, corsia di fallback su iOS/desktop. */
  readonly pdfHref: string;
  readonly variant?: "default" | "outline";
  readonly className?: string;
}

/**
 * Bottone "Stampa" unico, con degradazione a scalare:
 *
 *  1. stampante collegata → stampa diretta ESC/POS;
 *  2. Web Bluetooth disponibile ma nessuna stampante → scelta fra collegarne
 *     una e stampare il PDF;
 *  3. Web Bluetooth assente (iOS, Firefox, webview) → apre direttamente il PDF.
 *
 * L'etichetta è sempre e solo "Stampa": la parola "Bluetooth" compare
 * unicamente dove è azionabile, così su iPhone non si promette una feature che
 * lì non esiste (regola 8) e nessun utente resta senza modo di stampare.
 */
export function PrintReceiptButton({
  receipt,
  pdfHref,
  variant = "outline",
  className,
}: PrintReceiptButtonProps) {
  const printer = usePrinter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!printed) return;
    const timer = setTimeout(() => setPrinted(false), 2500);
    return () => clearTimeout(timer);
  }, [printed]);

  const openPdf = () => {
    setChooserOpen(false);
    globalThis.open(pdfHref, "_blank", "noopener,noreferrer");
  };

  const printToPrinter = async () => {
    if (!receipt) {
      openPdf();
      return;
    }
    setError(null);
    const failure = await printer.print(receipt);
    if (failure) {
      setError(printErrorMessage(failure));
      return;
    }
    setChooserOpen(false);
    setPrinted(true);
  };

  const handleClick = async () => {
    setError(null);

    if (printer.status === "connected") {
      await printToPrinter();
      return;
    }

    // `support` è null finché la rilevazione asincrona non conclude: in quel
    // caso si apre comunque la scelta, dove l'utente ha entrambe le strade.
    if (printer.support && printer.support.status !== "supported") {
      openPdf();
      return;
    }

    setChooserOpen(true);
  };

  const handleConnectAndPrint = async () => {
    setError(null);
    const failure = await printer.connect();
    if (failure) {
      setError(printErrorMessage(failure));
      return;
    }
    await printToPrinter();
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="lg"
        className={className}
        onClick={() => void handleClick()}
        disabled={printer.isBusy}
      >
        {printed ? (
          <>
            <Check className="mr-2 h-4 w-4 text-green-600" />
            <span className="text-green-600">Stampato</span>
          </>
        ) : (
          <>
            {printer.isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Stampa
          </>
        )}
      </Button>

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Come vuoi stampare?</DialogTitle>
            <DialogDescription>
              {printer.deviceName
                ? `${printer.deviceName} non è collegata in questo momento.`
                : "Collega una stampante termica Bluetooth per stampare al banco."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              onClick={() => void handleConnectAndPrint()}
              disabled={printer.isBusy}
            >
              {printer.deviceName ? "Ricollega e stampa" : "Collega stampante"}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={openPdf}>
              Stampa il PDF
            </Button>
          </div>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {error && !chooserOpen && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
