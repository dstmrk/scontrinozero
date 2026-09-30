"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyAdeCredentials } from "@/server/onboarding-actions";
import { ChangeAdePasswordDialog } from "@/components/ade/change-ade-password-dialog";
import { UtenzaPicker } from "@/components/ade/utenza-picker";
import type { AdeLoginMethod, AdeUtenzaCandidate } from "@/lib/ade/types";

type VerifyState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      pivaConflict?: boolean;
      pivaMismatch?: boolean;
      /** L'AdE ha rifiutato i dati salvati: niente "Riprova", si modificano. */
      credentialsRejected?: boolean;
      /**
       * `credentialsUpdatedAt` al momento del fallimento. Quando la prop cambia
       * le credenziali sono state risalvate e l'errore non le descrive più.
       */
      credentialsVersion: number | null;
      /**
       * Le partite IVA fra cui scegliere (HAR.md #18). La `denominazione` c'è
       * solo per quelle intestate a chi accede: per gli incarichi il portale
       * espone il solo numero, e lì non abbiamo un nome da mostrare.
       */
      utenzaChoices?: AdeUtenzaCandidate[];
    };

interface AdeCredentialsSectionProps {
  businessId: string | null;
  hasCredentials: boolean;
  verifiedAt: Date | null;
  loginMethod?: AdeLoginMethod;
  /**
   * `updated_at` della riga credenziali. Il salvataggio dalla matita la
   * aggiorna, la sola verifica no (`recordVerifyOutcome` scrive in SQL raw):
   * è il segnale con cui un errore di verifica diventa vecchio.
   */
  credentialsUpdatedAt?: Date | null;
}

const SUCCESS_DISMISS_MS = 3000;

/**
 * Un errore di verifica descrive le credenziali che c'erano quando è
 * arrivato. Se nel frattempo sono state risalvate (`updated_at` diverso) è
 * vecchio: si torna a idle. Derivato in render, non resettato in un effect:
 * dopo il salvataggio il `router.refresh()` non rimonta la sezione, e un
 * errore riferito ai dati di prima lascerebbe l'utente senza pulsante
 * davanti a credenziali nuove.
 */
function currentVerifyState(
  stored: VerifyState,
  credentialsVersion: number | null,
): VerifyState {
  if (
    stored.status === "error" &&
    stored.credentialsVersion !== credentialsVersion
  ) {
    return { status: "idle" };
  }
  return stored;
}

export function AdeCredentialsSection({
  businessId,
  hasCredentials,
  verifiedAt,
  loginMethod = "fisconline",
  credentialsUpdatedAt = null,
}: Readonly<AdeCredentialsSectionProps>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [storedVerifyState, setStoredVerifyState] = useState<VerifyState>({
    status: "idle",
  });
  const credentialsVersion = credentialsUpdatedAt?.getTime() ?? null;
  const verifyState = currentVerifyState(storedVerifyState, credentialsVersion);
  const [hasEverVerified, setHasEverVerified] = useState(!!verifiedAt);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!hasCredentials) {
    return (
      <p className="text-muted-foreground">Nessuna credenziale configurata.</p>
    );
  }

  function handleVerify(utenzaPiva?: string) {
    if (!businessId) return;

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    setStoredVerifyState({ status: "pending" });
    const id = businessId;

    startTransition(async () => {
      const result = await verifyAdeCredentials(id, utenzaPiva);

      if (result.error) {
        if (result.passwordExpired) {
          setStoredVerifyState({ status: "idle" });
          setChangePasswordOpen(true);
          return;
        }
        setStoredVerifyState({
          status: "error",
          message: result.error,
          pivaConflict: result.pivaConflict,
          pivaMismatch: result.pivaMismatch,
          utenzaChoices: result.utenzaChoices,
          credentialsRejected: result.credentialsRejected,
          credentialsVersion,
        });
        return;
      }

      setHasEverVerified(true);
      setStoredVerifyState({ status: "success" });
      router.refresh();

      dismissTimerRef.current = setTimeout(() => {
        setStoredVerifyState({ status: "idle" });
        dismissTimerRef.current = null;
      }, SUCCESS_DISMISS_MS);
    });
  }

  const isCie = loginMethod === "cie";
  const credentialsRejected =
    verifyState.status === "error" && !!verifyState.credentialsRejected;

  let buttonLabel: string;
  if (isCie) {
    buttonLabel = hasEverVerified ? "Ricollega" : "Collega";
    if (verifyState.status === "pending") {
      buttonLabel = "Collegamento in corso…";
    } else if (verifyState.status === "error") {
      buttonLabel = "Riprova";
    }
  } else {
    buttonLabel = "Verifica connessione";
    if (verifyState.status === "pending") {
      buttonLabel = "Verifica in corso…";
    } else if (verifyState.status === "error") {
      buttonLabel = "Riprova";
    }
  }

  return (
    <>
      {businessId && (
        <ChangeAdePasswordDialog
          businessId={businessId}
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
          onSuccess={() => {
            setChangePasswordOpen(false);
            setHasEverVerified(true);
            router.refresh();
          }}
        />
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Stato:</span>
            {hasEverVerified ? (
              <Badge variant="default">Verificate</Badge>
            ) : (
              <Badge variant="secondary">Non verificate</Badge>
            )}
          </div>
          {!credentialsRejected && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVerify()}
              disabled={verifyState.status === "pending"}
            >
              {verifyState.status === "pending" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {buttonLabel}
            </Button>
          )}
        </div>

        {isCie && (
          <p className="text-muted-foreground text-xs">
            Il collegamento richiede l&apos;approvazione di una notifica
            sull&apos;app CIE ID sul tuo telefono.
          </p>
        )}

        {isCie && verifyState.status === "pending" && (
          <p className="flex items-center gap-1.5 text-sm text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Approva ora la notifica sull&apos;app CIE ID sul tuo telefono…
          </p>
        )}

        {verifiedAt && verifyState.status !== "success" && (
          <p className="text-muted-foreground text-xs">
            Ultima verifica:{" "}
            {verifiedAt.toLocaleDateString("it-IT", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        {verifyState.status === "success" && (
          <p className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Connessione verificata.
          </p>
        )}

        {verifyState.status === "error" && (
          <div className="space-y-1">
            <p className="text-destructive flex items-center gap-1.5 text-sm">
              <AlertCircle className="h-4 w-4" />
              {verifyState.message}
            </p>
            {verifyState.credentialsRejected && (
              <p className="text-muted-foreground text-xs">
                Tocca la matita qui sopra e reinserisci i dati aggiornati.
                Riprovare con gli stessi dati non cambia l&apos;esito e può far
                bloccare l&apos;utenza dall&apos;Agenzia delle Entrate.
              </p>
            )}
            {verifyState.utenzaChoices &&
              verifyState.utenzaChoices.length > 0 && (
                <UtenzaPicker
                  choices={verifyState.utenzaChoices}
                  onSelect={handleVerify}
                />
              )}
            {verifyState.pivaConflict && (
              <p className="text-muted-foreground text-xs">
                Se questa P.IVA è tua (es. un vecchio account o un trial
                abbandonato),{" "}
                <a
                  href="/help/contatto-assistenza"
                  className="underline underline-offset-2"
                >
                  contatta l&apos;assistenza
                </a>{" "}
                per sbloccarla.
              </p>
            )}
            {verifyState.pivaMismatch && (
              <p className="text-muted-foreground text-xs">
                Per emettere scontrini con un&apos;altra partita IVA registra un
                account separato. Se pensi sia un errore,{" "}
                <a
                  href="/help/contatto-assistenza"
                  className="underline underline-offset-2"
                >
                  contatta l&apos;assistenza
                </a>
                {"."}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
