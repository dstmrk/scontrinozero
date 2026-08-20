"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { PAPER_COLUMNS } from "@/lib/printing/types";
import { sanitizeThermalText } from "@/lib/printing/thermal-text";
import {
  RECEIPT_FOOTER_NOTE_MAX_CHARS,
  RECEIPT_FOOTER_NOTE_MAX_LINES,
  normalizeReceiptFooterNote,
  receiptFooterNoteLines,
} from "@/lib/receipt-format";
import { updateReceiptFooterNote } from "@/server/profile-actions";

/**
 * L'anteprima imita la carta più stretta che supportiamo (58 mm = 32 colonne):
 * è la larghezza che detta anche il limite di caratteri, e ciò che ci sta qui
 * sta anche sul PDF e sulla ricevuta digitale.
 */
const PREVIEW_COLUMNS = PAPER_COLUMNS["58"];

/**
 * Messaggio di cortesia in coda allo scontrino (feature Pro).
 *
 * L'anteprima passa per le STESSE funzioni della stampa termica
 * (`receiptFooterNoteLines` + `sanitizeThermalText`): non è una simulazione
 * approssimata ma le righe esatte che la stampante emetterà, accenti maiuscoli
 * traslitterati compresi.
 */
export function ReceiptNoteSection({
  businessId,
  initialNote,
}: {
  readonly businessId: string;
  readonly initialNote: string | null;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [value, setValue] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(false);

  const normalized = normalizeReceiptFooterNote(value);
  const usedChars = normalized?.length ?? 0;
  const logicalLines = normalized ? normalized.split("\n").length : 0;
  const previewLines = receiptFooterNoteLines(value, {
    columns: PREVIEW_COLUMNS,
  }).map(sanitizeThermalText);

  // Validazione locale con gli stessi limiti della server action: il salvataggio
  // resta comunque validato lato server, qui si evita solo il round-trip.
  let localError: string | null = null;
  if (usedChars > RECEIPT_FOOTER_NOTE_MAX_CHARS) {
    localError = `Il messaggio non può superare ${RECEIPT_FOOTER_NOTE_MAX_CHARS} caratteri.`;
  } else if (logicalLines > RECEIPT_FOOTER_NOTE_MAX_LINES) {
    localError = `Il messaggio non può superare ${RECEIPT_FOOTER_NOTE_MAX_LINES} righe.`;
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("receiptFooterNote", value);
      return updateReceiptFooterNote(formData);
    },
    onSuccess: (result) => {
      if (result.error) return;
      setSaved(true);
      // Il messaggio viaggia con la pagina cassa (stampa termica): senza
      // refresh la prossima emissione userebbe il valore vecchio finché la
      // route resta nella cache RSC del client.
      router.refresh();
    },
  });

  const serverError = mutation.isError
    ? ERROR_MESSAGES.GENERIC_TRANSIENT
    : (mutation.data?.error ?? null);
  const isUnchanged = (normalized ?? "") === (initialNote ?? "");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={fieldId}>Messaggio in fondo allo scontrino</Label>
        <Textarea
          id={fieldId}
          value={value}
          rows={2}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          placeholder="Arrivederci e grazie!"
          aria-invalid={localError !== null}
          aria-describedby={`${fieldId}-hint`}
        />
        <p
          id={`${fieldId}-hint`}
          className="text-muted-foreground flex justify-between text-xs"
        >
          <span>
            Massimo {RECEIPT_FOOTER_NOTE_MAX_LINES} righe. Lascia vuoto per non
            stamparlo.
          </span>
          <span
            className={
              usedChars > RECEIPT_FOOTER_NOTE_MAX_CHARS
                ? "text-destructive font-medium"
                : ""
            }
          >
            {usedChars}/{RECEIPT_FOOTER_NOTE_MAX_CHARS}
          </span>
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium">
          Anteprima stampa (58 mm)
        </p>
        <div className="bg-muted/50 rounded-lg border border-dashed p-3 text-center font-mono text-xs">
          <p className="text-muted-foreground">DOCUMENTO N. 0001-0042</p>
          {previewLines.length > 0 ? (
            previewLines.map((line, idx) => (
              // Indice nella key: due righe possono essere identiche, e la
              // lista è statica (nessun riordino possibile).
              <p key={`${idx}-${line}`} className="whitespace-pre">
                {line}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground/60 italic">nessun messaggio</p>
          )}
        </div>
      </div>

      {localError && <p className="text-destructive text-sm">{localError}</p>}
      {!localError && serverError && (
        <p className="text-destructive text-sm">{serverError}</p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending || localError !== null || isUnchanged}
          onClick={() => {
            setSaved(false);
            mutation.mutate();
          }}
        >
          {mutation.isPending ? "Salvataggio…" : "Salva"}
        </Button>
        {saved && !mutation.isPending && (
          <span className="text-muted-foreground text-sm">Salvato.</span>
        )}
      </div>

      {/* La ricevuta digitale `/r/<id>` è pubblica: chi ha il link legge anche
          questo testo. Vale la pena dirlo esplicitamente. */}
      <p className="text-muted-foreground text-xs">
        Il messaggio compare sullo scontrino stampato, sul PDF e sulla ricevuta
        digitale, che è pubblica: non inserirci dati personali o informazioni
        fiscali.
      </p>
    </div>
  );
}
