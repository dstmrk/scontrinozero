"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { applyAdeDenominazione } from "@/server/profile-actions";
import type { DenominazioneMismatch } from "@/lib/business-identity";

/**
 * Avviso sul disallineamento fra la ragione sociale stampata sullo scontrino e
 * quella registrata all'AdE sulla partita IVA su cui si opera (REVIEW.md #106).
 *
 * **Non è una card: non renderizza nulla quando non c'è divergenza.** Lo
 * stesso criterio dell'avviso stale-pending — un blocco che compare sempre
 * smette di essere letto, e qui il caso normale è che i due nomi coincidano o
 * che la divergenza sia legittima (`mismatch` arriva già a null dal server).
 *
 * L'allineamento è un'azione esplicita e mai automatica: `business_name` è
 * l'unica cosa che l'esercente vede stampata, e riscrivergliela sotto il naso
 * al primo re-login sarebbe un cambiamento su un documento fiscale deciso da
 * noi. Il bottone non manda nessun nome alla action: manda l'id e basta.
 */
export function AdeDenominazioneNotice({
  businessId,
  mismatch,
}: {
  readonly businessId: string;
  readonly mismatch: DenominazioneMismatch | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!mismatch) return null;

  function handleApply() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyAdeDenominazione(businessId);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        // Eccezione lanciata = rete o server, non un errore d'input: quelli
        // tornano come { error } (regola 19).
        setError(ERROR_MESSAGES.GENERIC_TRANSIENT);
      }
    });
  }

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <p>
          {mismatch.current ? (
            <>
              Sugli scontrini compare <strong>{mismatch.current}</strong>.
            </>
          ) : (
            <>Sugli scontrini non compare nessuna ragione sociale.</>
          )}{" "}
          L&apos;Agenzia delle Entrate registra su questa partita IVA{" "}
          <strong>{mismatch.ade}</strong>.
        </p>
        <p>
          {mismatch.kind === "non-applicabile"
            ? "È troppo lunga per il campo: se vuoi usarla, accorciala a mano da «Modifica attività»."
            : "Se operi per conto di questa società, sullo scontrino dovrebbe comparire il suo nome."}
        </p>
        {mismatch.kind !== "non-applicabile" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleApply}
          >
            {isPending ? "Aggiorno…" : `Usa ${mismatch.ade}`}
          </Button>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </AlertDescription>
    </Alert>
  );
}
