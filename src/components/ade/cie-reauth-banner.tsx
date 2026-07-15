"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { verifyAdeCredentials } from "@/server/onboarding-actions";

type ReconnectState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

interface CieReauthBannerProps {
  /** Business per cui rinnovare la sessione CIE interattiva. */
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

/**
 * Banner di ri-collegamento CIE mostrato quando emit/void ritornano
 * `reauthRequired` (sessione interattiva assente/scaduta).
 *
 * A differenza di Fisconline la sessione CIE non è ri-creabile in silenzio: il
 * secondo fattore è la push sull'app CIE ID. Questo banner fa partire il
 * ricollegamento INLINE (stessa `verifyAdeCredentials` del bottone in
 * Impostazioni) senza costringere l'utente a lasciare cassa/annullo. Flusso
 * two-step, senza auto-retry: l'utente ricollega, poi ripreme il bottone
 * d'azione già presente nella schermata (regola 19/20: nessun documento fiscale
 * viene toccato qui — la sessione è solo un prerequisito).
 */
export function CieReauthBanner({
  businessId,
  actionLabel,
  onReconnected,
  onDismiss,
}: CieReauthBannerProps) {
  const [state, setState] = useState<ReconnectState>({ status: "idle" });
  const [, startTransition] = useTransition();

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
      <div
        role="status"
        className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
      >
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
      </div>
    );
  }

  const isPending = state.status === "pending";
  const isError = state.status === "error";

  let buttonLabel = "Ricollega";
  if (isPending) buttonLabel = "Ricollegamento in corso…";
  else if (isError) buttonLabel = "Riprova";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm",
        isError
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      {isPending ? (
        <p className="flex items-center gap-1.5">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Approva ora la notifica sull&apos;app CIE ID sul tuo telefono…
        </p>
      ) : isError ? (
        <p>{state.message}</p>
      ) : (
        <p>Sessione CIE scaduta. Ricollegati per continuare.</p>
      )}

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
