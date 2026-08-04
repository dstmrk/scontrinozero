"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Boundary di errore del segmento `/dashboard` (REVIEW.md #85).
 *
 * Senza questo file qualunque throw di una pagina del dashboard risale fino a
 * `src/app/global-error.tsx`, che per definizione rimpiazza l'intero documento
 * HTML — root layout compreso: l'esercente vede un `<h2>` nudo, senza shell
 * dell'app e senza CSS. Qui invece il fallback resta dentro
 * `src/app/dashboard/layout.tsx` (header, bottom nav, tema), quindi la
 * navigazione continua a funzionare e "Riprova" è un'azione reale.
 *
 * Copre OGNI throw delle pagine del segmento (`getPlan`, `getOnboardingStatus`,
 * `fetchReceiptPrintHeader`, ...), non solo quelli previsti.
 *
 * Due limiti da conoscere:
 * - in produzione Next **cancella** `error.message` prima di passarlo al
 *   boundary (sopravvive solo `digest`), quindi il testo qui è per forza
 *   generico: dove il messaggio deve essere preciso serve il degrado inline
 *   nella pagina (`getPlanSafe`, regola 19);
 * - un `error.tsx` non cattura gli errori del layout del proprio segmento:
 *   quelli di `dashboard/layout.tsx` continuano a risalire al global.
 */
export default function DashboardError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Gli errori lanciati dal server arrivano qui con `digest` valorizzato e
    // hanno GIÀ il loro evento Sentry, aperto da `onRequestError`
    // (`Sentry.captureRequestError` in `src/instrumentation.ts`): ri-catturarli
    // significherebbe contare due volte lo stesso guasto — il difetto di
    // `global-error.tsx` che questo boundary sostituisce sul dashboard.
    // Gli errori di render lato client non hanno digest e nessun altro li
    // vede: quelli vanno catturati qui, o si perdono.
    if (!error.digest) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
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
    </div>
  );
}
