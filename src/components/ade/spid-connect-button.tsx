"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectAdeWithSpid } from "@/server/onboarding-actions";
import { getCapacitorBridge, isNativeShell } from "@/lib/native/native-shell";
import { captureSpidCookieHeader } from "@/lib/native/spid-capture";

type ConnectResult = Awaited<ReturnType<typeof connectAdeWithSpid>>;

interface SpidConnectButtonProps {
  readonly businessId: string;
  /** Testo del pulsante: "Collega con SPID" di default. */
  readonly label?: string;
  /** Chiamata solo a collegamento riuscito, con il risultato della verifica. */
  readonly onConnected?: (result: ConnectResult) => void;
}

const noopSubscribe = () => () => {};

/**
 * Collega l'AdE con SPID dall'app nativa (docs/mobile-v2.md, slice 3b).
 *
 * Esiste solo nel guscio Capacitor: nel browser e nella PWA non rende niente,
 * perché lì non c'è un InAppBrowser da cui leggere i cookie del portale. Il
 * rilevamento passa da `useSyncExternalStore` con snapshot server `false`,
 * così l'HTML del server e il primo render del client coincidono.
 */
export function SpidConnectButton({
  businessId,
  label = "Collega con SPID",
  onConnected,
}: SpidConnectButtonProps) {
  const native = useSyncExternalStore(
    noopSubscribe,
    isNativeShell,
    () => false,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!native) return null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let header: string | null;
      try {
        header = await captureSpidCookieHeader(getCapacitorBridge());
      } catch {
        setError(
          "Non riesco ad aprire il login SPID. Aggiorna l'app e riprova.",
        );
        return;
      }
      // Browser chiuso prima di Documento commerciale online: l'utente ha
      // rinunciato, non è un errore.
      if (!header) return;

      const result = await connectAdeWithSpid(businessId, header);
      if (result.error) {
        setError(result.error);
        return;
      }
      onConnected?.(result);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isPending ? "Collegamento SPID in corso…" : label}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
