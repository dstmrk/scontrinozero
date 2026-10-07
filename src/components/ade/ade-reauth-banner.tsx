"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { verifyAdeCredentials } from "@/server/onboarding-actions";
import { SpidConnectButton } from "@/components/ade/spid-connect-button";
import { useIsNativeShell } from "@/lib/native/native-shell";
import type { InteractiveMethod } from "@/lib/ade/types";

type ReconnectState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

interface AdeReauthBannerProps {
  /**
   * Metodo della sessione scaduta, come lo restituisce il server in
   * `reauthRequired`: decide quale accesso chiedere.
   */
  readonly method: InteractiveMethod;
  /** Business per cui rinnovare la sessione interattiva. */
  readonly businessId: string;
  /**
   * Etichetta dell'azione da ripetere dopo il ricollegamento (es. "Emetti
   * scontrino" / "Annulla scontrino"), interpolata nel messaggio di successo.
   */
  readonly actionLabel: string;
  /** Callback opzionale invocata quando il ricollegamento riesce. */
  readonly onReconnected?: () => void;
  /**
   * Callback opzionale invocata quando l'utente chiude il banner di successo
   * (bottone "OK"). Il parent la usa per rimuovere il banner (es. azzerare lo
   * stato `reauthRequired`) così, ripremuto il bottone d'azione, non ricompare
   * il messaggio stale di sessione scaduta.
   */
  readonly onDismiss?: () => void;
}

const AMBER_CLASS =
  "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";

/**
 * Banner di ri-collegamento mostrato quando emissione, annullo o reso
 * ritornano `reauthRequired` (sessione interattiva assente/scaduta).
 *
 * A differenza di Fisconline le sessioni CIE e SPID non si ricreano in
 * silenzio: serve un gesto umano, diverso per metodo.
 *  - **CIE**: la push sull'app CIE ID. Il ricollegamento parte INLINE (stessa
 *    `verifyAdeCredentials` del bottone in Impostazioni).
 *  - **SPID**: un nuovo login SPID nell'InAppBrowser, possibile solo nell'app
 *    nativa (`SpidConnectButton`). Nel browser e nella PWA il banner rimanda
 *    all'app, senza pulsanti che lì non potrebbero funzionare.
 *
 * Flusso two-step, senza auto-retry: l'utente ricollega, poi ripreme il bottone
 * d'azione già presente nella schermata (regola 19/20: nessun documento fiscale
 * viene toccato qui — la sessione è solo un prerequisito).
 */
export function AdeReauthBanner({
  method,
  businessId,
  actionLabel,
  onReconnected,
  onDismiss,
}: AdeReauthBannerProps) {
  const [state, setState] = useState<ReconnectState>({ status: "idle" });
  const [, startTransition] = useTransition();
  const native = useIsNativeShell();

  function handleSpidConnected() {
    setState({ status: "success" });
    onReconnected?.();
  }

  function handleReconnect() {
    setState({ status: "pending" });
    startTransition(async () => {
      const result = await verifyAdeCredentials(businessId);
      if (result.error) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "success" });
      onReconnected?.();
    });
  }

  if (state.status === "success") {
    return (
      <output className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
        <p>{`Ricollegato! Premi di nuovo «${actionLabel}».`}</p>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setState({ status: "idle" });
              onDismiss?.();
            }}
          >
            OK
          </Button>
        </div>
      </output>
    );
  }

  if (method === "spid") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm",
          AMBER_CLASS,
        )}
      >
        {native ? (
          <>
            <p>Sessione SPID scaduta. Ricollegati con SPID per continuare.</p>
            <SpidConnectButton
              businessId={businessId}
              label="Ricollega con SPID"
              onConnected={handleSpidConnected}
            />
          </>
        ) : (
          <p>
            Sessione SPID scaduta: ricollegati con SPID dall&apos;app
            ScontrinoZero, poi riprova.
          </p>
        )}
      </div>
    );
  }

  const isPending = state.status === "pending";
  const isError = state.status === "error";

  let buttonLabel = "Ricollega";
  if (isPending) buttonLabel = "Ricollegamento in corso…";
  else if (isError) buttonLabel = "Riprova";

  // Estratto dal JSX per evitare un ternario annidato (SonarCloud S3358).
  let messageNode: ReactNode;
  if (isPending) {
    messageNode = (
      <p className="flex items-center gap-1.5">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Approva ora la notifica sull&apos;app CIE ID sul tuo telefono…
      </p>
    );
  } else if (isError) {
    messageNode = <p>{state.message}</p>;
  } else {
    messageNode = <p>Sessione CIE scaduta. Ricollegati per continuare.</p>;
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm",
        isError
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : AMBER_CLASS,
      )}
    >
      {messageNode}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReconnect}
          disabled={isPending}
        >
          {isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {buttonLabel}
        </Button>
        {!isPending && (
          <Link href="/dashboard/settings" className="font-medium underline">
            Vai alle impostazioni
          </Link>
        )}
      </div>
    </div>
  );
}
