"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  isDeploySkewError,
  recoverFromDeploySkew,
  reloadPage,
} from "@/lib/deploy-skew";

/**
 * Contenuto condiviso dai boundary d'errore (`src/app/error.tsx` e
 * `src/app/dashboard/error.tsx`): i due file differiscono solo per il
 * contenitore, il comportamento è questo.
 *
 * Copre due casi distinti.
 *
 * 1. **Guasto generico** — messaggio rassicurante + "Riprova" (`reset()`), che
 *    ri-renderizza il segmento. In produzione Next cancella `error.message`
 *    prima di passarlo al boundary (sopravvive solo `digest`), quindi il testo
 *    è per forza generico: dove serve preciso va usato il degrado inline nella
 *    pagina (regola 19).
 * 2. **Deploy skew** — il bundle della scheda è di una release precedente e la
 *    Server Action chiamata non esiste più sul server (SCONTRINOZERO-Z). Qui
 *    "Riprova" sarebbe un vicolo cieco — il bundle vecchio resta in memoria —
 *    quindi ricarichiamo la pagina, che è la cura documentata da Next.
 */

/**
 * Quanto aspettiamo la coda Sentry prima di ricaricare. Il reload interrompe
 * le richieste in volo: senza flush l'evento appena accodato può non partire,
 * e resteremmo ciechi proprio sulla metrica che dice quanti utenti prende lo
 * skew a ogni release.
 */
const SENTRY_FLUSH_TIMEOUT_MS = 2000;

interface AppErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function AppErrorFallback({
  error,
  reset,
}: Readonly<AppErrorFallbackProps>) {
  const isSkew = isDeploySkewError(error);
  // Il reload parte da solo: il bottone manuale compare solo se il recupero
  // automatico si è già speso di recente. Lo stato NON è inizializzato da
  // `isSkew`, così un secondo errore sullo stesso boundary riparte pulito.
  const [manualReloadNeeded, setManualReloadNeeded] = useState(false);

  useEffect(() => {
    // Gli errori lanciati dal server arrivano qui con `digest` valorizzato e
    // hanno GIÀ il loro evento Sentry, aperto da `onRequestError`
    // (`Sentry.captureRequestError` in `src/instrumentation.ts`): ri-catturarli
    // significherebbe contare due volte lo stesso guasto. Gli errori client
    // — skew compreso — non hanno digest e nessun altro li vede.
    if (!error.digest) {
      Sentry.captureException(error);
    }
    if (!isSkew) return;

    let active = true;
    void Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS)
      .catch(() => undefined)
      .then(() => {
        if (!active) return;
        // false = reload già tentato da poco. Non rimbalziamo l'utente: gli
        // lasciamo il ricarico manuale.
        if (!recoverFromDeploySkew()) setManualReloadNeeded(true);
      });

    return () => {
      active = false;
    };
  }, [error, isSkew]);

  if (isSkew) {
    return (
      <>
        <Alert>
          <AlertTitle>È disponibile una nuova versione</AlertTitle>
          <AlertDescription>
            {manualReloadNeeded
              ? "Ricarica la pagina per aggiornare l'app. L'ultima operazione non è stata registrata: potrai ripeterla subito dopo."
              : "Stiamo ricaricando la pagina per aggiornare l'app. L'ultima operazione non è stata registrata: potrai ripeterla subito dopo."}
          </AlertDescription>
        </Alert>

        {manualReloadNeeded && (
          <Button onClick={reloadPage}>Ricarica la pagina</Button>
        )}
      </>
    );
  }

  return (
    <>
      <Alert variant="critical">
        <AlertTitle>Qualcosa è andato storto</AlertTitle>
        <AlertDescription>
          Non siamo riusciti a caricare questa pagina. Riprova tra qualche
          istante: i tuoi dati e gli scontrini già emessi non sono stati
          toccati.
        </AlertDescription>
      </Alert>

      <Button onClick={() => reset()}>Riprova</Button>

      {error.digest && (
        <p className="text-muted-foreground text-xs">
          Codice di riferimento: <code>{error.digest}</code>
        </p>
      )}
    </>
  );
}
