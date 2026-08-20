"use client";

import { AppErrorFallback } from "@/components/errors/app-error-fallback";

/**
 * Boundary di errore del segmento `/dashboard` (REVIEW.md #85).
 *
 * Esiste separato da `src/app/error.tsx` per il contenitore: qui il fallback
 * resta dentro `src/app/dashboard/layout.tsx` (header, bottom nav, tema),
 * quindi la navigazione continua a funzionare e "Riprova" è un'azione reale.
 * Il comportamento — cattura Sentry senza doppioni, recupero dal deploy skew —
 * vive nel componente condiviso.
 *
 * Copre OGNI throw delle pagine del segmento (`getPlan`, `getOnboardingStatus`,
 * `fetchReceiptPrintHeader`, ...), non solo quelli previsti.
 *
 * Due limiti da conoscere:
 * - in produzione Next **cancella** `error.message` prima di passarlo al
 *   boundary (sopravvive solo `digest`), quindi il testo mostrato è per forza
 *   generico: dove il messaggio deve essere preciso serve il degrado inline
 *   nella pagina (`getPlanSafe`, regola 19);
 * - un `error.tsx` non cattura gli errori del layout del proprio segmento:
 *   quelli di `dashboard/layout.tsx` risalgono a `src/app/error.tsx`.
 */
export default function DashboardError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <AppErrorFallback error={error} reset={reset} />
    </div>
  );
}
