"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import {
  applyAdeDenominazione,
  applyAdeSedeLegale,
} from "@/server/profile-actions";
import type {
  DenominazioneMismatch,
  SedeLegaleMismatch,
} from "@/lib/business-identity";

/**
 * Avviso sul disallineamento fra l'identità stampata sullo scontrino e quella
 * registrata all'AdE sulla partita IVA su cui si opera (REVIEW.md #106).
 *
 * **Non è una card: non renderizza nulla quando non c'è divergenza.** Lo
 * stesso criterio dell'avviso stale-pending — un blocco che compare sempre
 * smette di essere letto, e qui il caso normale è che i valori coincidano o
 * che la divergenza sia legittima (i mismatch arrivano già a null dal server).
 *
 * L'allineamento è sempre esplicito e mai automatico: quelle colonne sono
 * l'unica cosa che l'esercente vede stampata, e riscrivergliele sotto il naso
 * al primo re-login sarebbe un cambiamento su un documento fiscale deciso da
 * noi. I bottoni non mandano nessun valore alla action: mandano l'id e basta.
 *
 * **Nome e indirizzo restano due azioni separate**, non un bottone solo: per
 * una società la sede legale può essere lo studio del commercialista mentre il
 * punto vendita sta altrove, e sullo scontrino ci va il secondo. Unirle
 * costringerebbe a prendere anche l'indirizzo per avere il nome giusto.
 */
export function AdeIdentityNotice({
  businessId,
  denominazione,
  sedeLegale,
}: {
  readonly businessId: string;
  readonly denominazione: DenominazioneMismatch | null;
  readonly sedeLegale: SedeLegaleMismatch | null;
}) {
  if (!denominazione && !sedeLegale) return null;

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        {denominazione && (
          <DenominazioneBlock
            businessId={businessId}
            mismatch={denominazione}
          />
        )}
        {sedeLegale && (
          <SedeLegaleBlock businessId={businessId} mismatch={sedeLegale} />
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Bottone + errore inline condivisi dai due blocchi. `action` prende il solo
 * id per costruzione: è la garanzia che nessun valore proposto da una pagina
 * stantia raggiunga il DB.
 */
function ApplyButton({
  businessId,
  action,
  label,
}: {
  readonly businessId: string;
  readonly action: (businessId: string) => Promise<{ error?: string }>;
  readonly label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApply() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(businessId);
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
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handleApply}
      >
        {isPending ? "Aggiorno…" : label}
      </Button>
      {error && <p className="text-destructive">{error}</p>}
    </>
  );
}

function DenominazioneBlock({
  businessId,
  mismatch,
}: {
  readonly businessId: string;
  readonly mismatch: DenominazioneMismatch;
}) {
  return (
    <div className="space-y-1">
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
        <ApplyButton
          businessId={businessId}
          action={applyAdeDenominazione}
          label={`Usa ${mismatch.ade}`}
        />
      )}
    </div>
  );
}

function SedeLegaleBlock({
  businessId,
  mismatch,
}: {
  readonly businessId: string;
  readonly mismatch: SedeLegaleMismatch;
}) {
  return (
    <div className="space-y-1">
      <p>
        L&apos;indirizzo stampato sugli scontrini non coincide con la sede
        legale registrata all&apos;Agenzia delle Entrate:
      </p>
      <ul>
        {mismatch.fields.map((field) => (
          <li key={field.label}>
            <strong>{field.label}</strong>: {field.current ?? "non impostato"} ·
            all&apos;AdE <strong>{field.ade}</strong>
          </li>
        ))}
      </ul>
      <p>
        {mismatch.patch === null
          ? "Non possiamo salvarla così com'è: copiala a mano da «Modifica attività»."
          : "Se la sede legale è anche il punto vendita, allineala. Se vendi altrove, lascia l'indirizzo com'è — sullo scontrino va quello del punto vendita."}
      </p>
      {mismatch.patch !== null && (
        <ApplyButton
          businessId={businessId}
          action={applyAdeSedeLegale}
          label="Usa la sede legale"
        />
      )}
    </div>
  );
}
