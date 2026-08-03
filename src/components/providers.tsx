"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SerwistProvider } from "@serwist/next/react";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { initInstallPromptCapture } from "@/lib/pwa/install-prompt-store";

// Aggancia il listener `beforeinstallprompt` il prima possibile: `Providers`
// fa parte dell'entry client condiviso del root layout, quindi viene valutato
// ben prima che il banner annidato nel dashboard layout monti. Idempotente e
// SSR-safe (no-op senza `window`). Vedi install-prompt-store.ts.
initInstallPromptCapture();

export function Providers({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return (
    // Registrazione esplicita del service worker: la configurator mode di
    // Serwist costruisce il bundle ma non inietta più lo script di
    // registrazione come faceva il vecchio plugin webpack (REVIEW #84).
    //
    // I due default disattivati non sono preferenze estetiche:
    // - `reloadOnOnline` (default true) ricarica la pagina all'evento `online`.
    //   Al banco, con rete ballerina, significa perdere il carrello in corso
    //   proprio quando la connessione torna.
    // - `cacheOnNavigation` (default true) sovrascrive history.pushState e
    //   replaceState per cachare le URL navigate: interop rischiosa con il
    //   router, e nessun beneficio: le pagine visitate le cacha già la
    //   NetworkFirst delle navigazioni di `defaultCache`.
    //
    // `disable` in development perché `serwist build` è incatenato allo script
    // `build`, non a `dev`: lì public/sw.js non esiste.
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === "development"}
      reloadOnOnline={false}
      cacheOnNavigation={false}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SerwistProvider>
  );
}
