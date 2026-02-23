"use client";

import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiptSuccessProps {
  readonly documentId?: string;
  readonly adeProgressive?: string;
  readonly adeTransactionId?: string;
  readonly onNewReceipt: () => void;
}

export function ReceiptSuccess({
  documentId,
  adeProgressive,
  adeTransactionId,
  onNewReceipt,
}: ReceiptSuccessProps) {
  const now = new Date().toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-8 text-center">
      <CheckCircle2 className="text-primary h-16 w-16" />

      <div className="space-y-1">
        <h2 className="text-2xl font-bold">Scontrino emesso</h2>
        <p className="text-muted-foreground text-sm">{now}</p>
      </div>

      {(adeProgressive ?? adeTransactionId) && (
        <div className="bg-muted w-full rounded-xl px-4 py-3 text-left">
          {adeProgressive && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Progressivo AdE
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
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() =>
            window.open(`/api/documents/${documentId}/pdf`, "_blank")
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Scarica PDF
        </Button>
      )}

      <Button type="button" size="lg" className="w-full" onClick={onNewReceipt}>
        Nuovo scontrino
      </Button>
    </div>
  );
}
