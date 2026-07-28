"use client";

import { useEffect, useState } from "react";
import { Bluetooth, BluetoothConnected, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePrinter } from "@/hooks/use-printer";
import {
  printErrorMessage,
  printSupportMessage,
} from "@/lib/printing/error-messages";
import {
  DEFAULT_PRINTER_PREFERENCES,
  readPrinterPreferences,
  writePrinterPreferences,
  type PrinterPreferences,
} from "@/lib/printing/printer-preferences";
import type { PaperWidth } from "@/lib/printing/types";

const PAPER_OPTIONS: readonly { value: PaperWidth; label: string }[] = [
  { value: "58", label: "58 mm" },
  { value: "80", label: "80 mm" },
];

export function PrinterSection() {
  const printer = usePrinter();
  const [message, setMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Le preferenze vivono su localStorage: leggerle al primo render darebbe un
  // HTML diverso da quello del server. Stesso trattamento del tema in
  // `theme-section.tsx`: fino al mount si mostrano i default.
  const [preferences, setPreferences] = useState<PrinterPreferences>(
    DEFAULT_PRINTER_PREFERENCES,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- idratazione post-mount da localStorage, evita hydration mismatch */
    setPreferences(readPrinterPreferences());
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const update = (patch: Partial<PrinterPreferences>) => {
    setPreferences(writePrinterPreferences(patch));
  };

  const isConnected = printer.status === "connected";

  const handleConnect = async () => {
    setMessage(null);
    setFeedback(null);
    const error = await printer.connect();
    if (error) setMessage(printErrorMessage(error));
  };

  const handleTestPrint = async () => {
    setMessage(null);
    setFeedback(null);
    const error = await printer.testPrint();
    if (error) {
      setMessage(printErrorMessage(error));
      return;
    }
    setFeedback("Stampa di prova inviata.");
  };

  // `support` è null finché la rilevazione asincrona non finisce: non si
  // mostra nulla di definitivo per non far lampeggiare un messaggio sbagliato.
  const supportNotice =
    printer.support && printer.support.status !== "supported"
      ? printSupportMessage(printer.support)
      : null;

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Collega una stampante termica Bluetooth per stampare lo scontrino al
        banco. L&apos;abbinamento vale per questo dispositivo.
      </p>

      <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
        {isConnected ? (
          <BluetoothConnected
            className="text-primary size-5 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <Bluetooth
            className="text-muted-foreground size-5 shrink-0"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {printer.deviceName ?? "Nessuna stampante"}
          </p>
          <p className="text-muted-foreground text-xs">
            {isConnected ? "Collegata" : "Non collegata"}
          </p>
        </div>
        {printer.isBusy && (
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-hidden="true"
          />
        )}
      </div>

      {supportNotice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {supportNotice}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {isConnected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void printer.disconnect()}
                disabled={printer.isBusy}
              >
                Scollega
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleConnect()}
                disabled={printer.isBusy}
              >
                <Bluetooth className="mr-2 size-4" aria-hidden="true" />
                {printer.deviceName ? "Ricollega" : "Collega stampante"}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => void handleTestPrint()}
              disabled={printer.isBusy || !isConnected}
            >
              <Printer className="mr-2 size-4" aria-hidden="true" />
              Stampa di prova
            </Button>
          </div>

          <fieldset className="m-0 space-y-4 border-0 p-0">
            <legend className="sr-only">Opzioni di stampa</legend>

            <div className="flex items-start gap-3">
              <Checkbox
                id="printer-auto"
                checked={preferences.autoPrint}
                disabled={!mounted}
                onCheckedChange={(checked) =>
                  update({ autoPrint: checked === true })
                }
              />
              <div className="grid gap-1">
                <Label htmlFor="printer-auto">Stampa automatica</Label>
                <p className="text-muted-foreground text-xs">
                  Lo scontrino esce da solo appena l&apos;Agenzia delle Entrate
                  conferma l&apos;emissione.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Un <Label htmlFor> punterebbe a UNO dei due bottoni,
                  ribattezzandolo "Larghezza carta" e rendendolo
                  indistinguibile dall'altro per uno screen reader: l'etichetta
                  appartiene al gruppo, non a un'opzione. */}
              <p id="printer-width-label" className="text-sm font-medium">
                Larghezza carta
              </p>
              <div
                role="group"
                aria-labelledby="printer-width-label"
                className="flex gap-2"
              >
                {PAPER_OPTIONS.map(({ value, label }) => {
                  const isActive = mounted && preferences.paperWidth === value;
                  return (
                    <Button
                      key={value}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      aria-pressed={isActive}
                      onClick={() => update({ paperWidth: value })}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="printer-qr"
                checked={preferences.printQr}
                disabled={!mounted}
                onCheckedChange={(checked) =>
                  update({ printQr: checked === true })
                }
              />
              <div className="grid gap-1">
                <Label htmlFor="printer-qr">Stampa il QR della ricevuta</Label>
                <p className="text-muted-foreground text-xs">
                  Il cliente lo inquadra per aprire la ricevuta digitale. Non
                  tutte le stampanti economiche lo supportano: verificalo con la
                  stampa di prova.
                </p>
              </div>
            </div>
          </fieldset>
        </>
      )}

      {message && (
        <p className="text-destructive text-sm" role="alert">
          {message}
        </p>
      )}
      {feedback && (
        <p className="text-sm text-green-600" role="status">
          {feedback}
        </p>
      )}
    </div>
  );
}
