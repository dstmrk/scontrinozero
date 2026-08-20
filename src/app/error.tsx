"use client";

import { AppErrorFallback } from "@/components/errors/app-error-fallback";

/**
 * Boundary di errore della root: copre ogni segmento che non ne ha uno proprio
 * — onboarding, auth, marketing, pagina pubblica dello scontrino.
 *
 * Prima di questo file l'unica rete fuori da `/dashboard` era
 * `src/app/global-error.tsx`, che per definizione rimpiazza il documento HTML
 * intero, root layout compreso: un `<h2>` nudo, senza CSS né shell. È quello
 * che ha visto l'utente di SCONTRINOZERO-Z a metà onboarding, dopo aver
 * digitato le credenziali CIE. Qui invece il fallback resta dentro
 * `src/app/layout.tsx`, quindi tema, font e stili sopravvivono.
 *
 * `global-error.tsx` resta per gli errori del root layout, che nessun
 * `error.tsx` può catturare.
 */
export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <AppErrorFallback error={error} reset={reset} />
      </div>
    </div>
  );
}
