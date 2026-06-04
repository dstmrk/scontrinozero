"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
