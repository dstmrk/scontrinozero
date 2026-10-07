"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdeReauthBanner } from "@/components/ade/ade-reauth-banner";
import { TrialExpiredMessage } from "@/components/billing/trial-expired-message";
import { PrintReceiptButton } from "@/components/printing/print-receipt-button";
import { TRIAL_EXPIRED_MESSAGE } from "@/lib/plans-shared";
import type { ReceiptPrintProfile } from "@/lib/receipts/print-profile";
import { calcDocTotal } from "@/lib/receipts/receipt-totals";
import { buildReturnLines } from "@/lib/receipts/return-lines";
import {
  parseReturnQuantityInput,
  returnableQuantity,
} from "@/lib/receipts/return-progress";
import { formatCurrency } from "@/lib/utils";
import { returnReceipt } from "@/server/return-actions";
import { getReceiptDetail } from "@/server/storico-actions";
import type { ReceiptListItem } from "@/types/storico";
import { toPrintableReceipt } from "./storico-printable";

interface ReturnReceiptPanelProps {
  /** La vendita da rendere (SALE accettata, non resa del tutto). */
  readonly receipt: ReceiptListItem;
  readonly businessId: string;
  readonly printProfile: ReceiptPrintProfile | null;
  readonly onBack: () => void;
  readonly onClose: () => void;
  /** Reso registrato: il parent rilegge la vendita (già-reso aggiornato). */
  readonly onReturned: (saleId: string) => void;
}

function formatQuantity(value: number | string): string {
  return Number(value).toLocaleString("it-IT");
}

/**
 * Reso merce dal dettaglio di una vendita: si sceglie quanti pezzi rendere per
 * riga, si conferma, e si consegna la ricevuta di reso.
 *
 * Il tetto per riga è il rendibile secondo lo storico (venduti − resi da
 * ScontrinoZero). Il servizio lo ricontrolla sul dettaglio AdE, che vede
 * anche i resi fatti dal portale: in quel caso il suo errore compare qui.
 */
export function ReturnReceiptPanel({
  receipt,
  businessId,
  printProfile,
  onBack,
  onClose,
  onReturned,
}: ReturnReceiptPanelProps) {
  const [inputs, setInputs] = useState<string[]>(() =>
    receipt.lines.map(() => ""),
  );
  // Una chiave per richiesta: stabile sui retry della stessa richiesta, nuova
  // quando cambiano le quantità (il servizio rifiuta una chiave riusata con
  // un corpo diverso).
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [returnItem, setReturnItem] = useState<ReceiptListItem | null>(null);

  const returnable = receipt.lines.map(returnableQuantity);
  const parsed = inputs.map((raw, i) =>
    parseReturnQuantityInput(raw, returnable[i]),
  );
  const quantities = parsed.map((q) => q ?? 0);
  const canConfirm =
    parsed.every((q) => q !== null) && quantities.some((q) => q > 0);

  // Anteprima con la stessa aritmetica delle righe che il servizio salverà
  // (`buildReturnLines`, sconto ripartito in modo telescopico): l'importo
  // mostrato prima della conferma è quello della ricevuta.
  const previewTotal = calcDocTotal(
    buildReturnLines(
      receipt.lines.map((l, lineIndex) => ({ ...l, lineIndex })),
      receipt.lines.map((l) => Number(l.returnedQuantity)),
      quantities,
    ),
  );

  function updateInputs(next: string[]) {
    setInputs(next);
    setIdempotencyKey(crypto.randomUUID());
  }

  const mutation = useMutation({
    mutationFn: () =>
      returnReceipt({
        documentId: receipt.id,
        idempotencyKey,
        businessId,
        quantities,
      }),
    onSuccess: (result) => {
      if (result.error || result.reauthRequired || !result.returnDocumentId) {
        return;
      }
      onReturned(receipt.id);
      // Le righe del reso nascono sul server: rilette, danno la stampa
      // termica. Fuori dalla mutation, di proposito: il reso è già
      // trasmesso, e una rilettura fallita non deve trasformarlo in un
      // errore a schermo. Senza rilettura la stampa ripiega sul PDF.
      getReceiptDetail(businessId, result.returnDocumentId)
        .then((detail) => setReturnItem(detail.item))
        .catch(() => setReturnItem(null));
    },
  });

  const returned = mutation.data;
  if (returned?.returnDocumentId) {
    const printable = returnItem
      ? toPrintableReceipt(returnItem, printProfile, globalThis.location.origin)
      : null;
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-green-600">Reso confermato</DialogTitle>
          <DialogDescription>
            Il documento di reso è stato trasmesso all&apos;Agenzia delle
            Entrate.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-800">
            Progressivo reso:{" "}
            <span className="font-mono">{returned.adeProgressive ?? "—"}</span>
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a
              href={`/r/${returned.returnDocumentId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              Ricevuta di reso
            </a>
          </Button>
          <PrintReceiptButton
            receipt={printable}
            pdfHref={`/api/documents/${returned.returnDocumentId}/pdf`}
            size="default"
          />
          <Button onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </>
    );
  }

  const error =
    mutation.data?.error ??
    (mutation.isError ? "Errore imprevisto. Riprova." : null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Reso dello scontrino{" "}
          {receipt.adeProgressive ?? receipt.id.slice(0, 8)}
        </DialogTitle>
        <DialogDescription>
          Scegli quanti pezzi rendere per ogni riga.
        </DialogDescription>
      </DialogHeader>

      <div className="min-w-0 divide-y rounded-md border">
        {receipt.lines.map((line, index) => {
          const max = returnable[index];
          const invalid = parsed[index] === null;
          const id = `return-qty-${index}`;
          return (
            <div
              key={`${receipt.id}-return-${index}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{line.description}</p>
                <p className="text-muted-foreground">
                  Venduti {formatQuantity(line.quantity)} · già resi{" "}
                  {formatQuantity(line.returnedQuantity)}
                </p>
                {invalid && (
                  <p className="text-xs text-red-700" role="alert">
                    Al massimo {formatQuantity(max)}
                  </p>
                )}
              </div>
              {max > 0 ? (
                <Input
                  id={id}
                  aria-label={`Pezzi da rendere: ${line.description}`}
                  aria-invalid={invalid}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-20 shrink-0 text-right"
                  value={inputs[index]}
                  disabled={mutation.isPending}
                  onChange={(e) => {
                    const next = [...inputs];
                    next[index] = e.target.value;
                    updateInputs(next);
                  }}
                />
              ) : (
                <span className="text-muted-foreground shrink-0 text-xs">
                  Già reso tutto
                </span>
              )}
            </div>
          );
        })}
        <div className="flex justify-between px-3 py-2 text-sm font-semibold">
          <span>Totale reso</span>
          <span data-testid="return-total">{formatCurrency(previewTotal)}</span>
        </div>
      </div>

      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <strong>⚠️ Attenzione:</strong> il reso è irreversibile. Viene trasmesso
        all&apos;Agenzia delle Entrate come documento di reso e riduce i
        corrispettivi del giorno.
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error === TRIAL_EXPIRED_MESSAGE ? <TrialExpiredMessage /> : error}
        </div>
      )}

      {mutation.data?.reauthRequired && (
        <AdeReauthBanner
          method={mutation.data.reauthRequired}
          businessId={businessId}
          actionLabel="Conferma reso"
          onDismiss={() => mutation.reset()}
        />
      )}

      <DialogFooter className="flex-wrap gap-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canConfirm || mutation.isPending}
        >
          {mutation.isPending ? "Trasmissione…" : "Conferma reso"}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            updateInputs(returnable.map((q) => (q > 0 ? String(q) : "")))
          }
          disabled={mutation.isPending}
        >
          Rendi tutto
        </Button>
        <Button
          variant="outline"
          onClick={onBack}
          disabled={mutation.isPending}
        >
          Indietro
        </Button>
      </DialogFooter>
    </>
  );
}
