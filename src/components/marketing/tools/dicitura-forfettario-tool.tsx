"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  buildDicituraForfettario,
  type DicituraDocumento,
} from "@/lib/strumenti/dicitura-forfettario";
import { parseItalianNumber } from "@/lib/strumenti/parse-number";

const COPY_FEEDBACK_MS = 2000;

export function DicituraForfettarioTool() {
  const importoId = useId();
  const ritenutaId = useId();
  const [documento, setDocumento] = useState<DicituraDocumento>("fattura");
  const [conRitenuta, setConRitenuta] = useState(false);
  const [importoRaw, setImportoRaw] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const result = useMemo(() => {
    const parsed = parseItalianNumber(importoRaw);
    return buildDicituraForfettario({
      documento,
      conRitenuta,
      importoEuro: Number.isFinite(parsed) ? parsed : null,
    });
  }, [documento, conRitenuta, importoRaw]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.testo);
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(
        () => setCopied(false),
        COPY_FEEDBACK_MS,
      );
    } catch {
      // Clipboard non disponibile (webview, permessi negati): il testo resta
      // selezionabile manualmente qui sotto, nessun errore da mostrare.
    }
  };

  const documentoOptions: readonly {
    value: DicituraDocumento;
    label: string;
  }[] = [
    { value: "fattura", label: "Fattura" },
    { value: "scontrino", label: "Scontrino" },
  ];

  return (
    <div className="bg-card mt-6 rounded-lg border p-5">
      <fieldset>
        <legend className="text-sm font-medium">
          {"Che documento devi emettere?"}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {documentoOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={documento === option.value ? "default" : "outline"}
              aria-pressed={documento === option.value}
              onClick={() => setDocumento(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>

      {documento === "fattura" && (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id={ritenutaId}
              checked={conRitenuta}
              onCheckedChange={(checked) => setConRitenuta(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor={ritenutaId} className="text-sm leading-snug">
              {
                "Aggiungi la clausola sulla ritenuta d'acconto (comma 67) — utile se il cliente è un'azienda o un professionista"
              }
            </Label>
          </div>
          <div>
            <Label htmlFor={importoId}>
              {"Importo della fattura (facoltativo, per il controllo bollo)"}
            </Label>
            <Input
              id={importoId}
              type="text"
              inputMode="decimal"
              placeholder="es. 120,00"
              value={importoRaw}
              onChange={(e) => setImportoRaw(e.target.value)}
              className="mt-1 max-w-48"
            />
          </div>
        </div>
      )}

      {result.obbligatoria ? (
        <div className="mt-5">
          <p className="text-sm font-medium">{"Dicitura da riportare:"}</p>
          <output
            aria-live="polite"
            className="bg-muted/40 border-border mt-2 block rounded-md border p-4 text-sm leading-relaxed select-all"
          >
            {result.testo}
          </output>
          <Button
            type="button"
            onClick={handleCopy}
            className={cn("mt-3", copied && "pointer-events-none")}
          >
            {copied ? (
              <>
                <Check className="mr-1 h-4 w-4" />
                {"Copiato!"}
              </>
            ) : (
              <>
                <Copy className="mr-1 h-4 w-4" />
                {"Copia la dicitura"}
              </>
            )}
          </Button>
        </div>
      ) : null}

      {result.note.map((nota) => (
        <output
          key={nota}
          aria-live="polite"
          className="border-border bg-muted/40 text-muted-foreground mt-4 flex items-start gap-3 rounded-md border p-4 text-sm leading-relaxed"
        >
          <Info className="text-primary mt-0.5 h-4 w-4 shrink-0" />
          <span>{nota}</span>
        </output>
      ))}

      <p className="text-muted-foreground mt-4 text-xs">
        {
          "Il testo viene generato in locale nel browser: nessun dato viene trasmesso a server esterni."
        }
      </p>
    </div>
  );
}
