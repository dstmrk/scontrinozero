"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verifyAdeCredentials } from "@/server/onboarding-actions";
import { ChangeAdePasswordDialog } from "@/components/ade/change-ade-password-dialog";
import type { AdeLoginMethod } from "@/lib/ade/types";

type VerifyState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      pivaConflict?: boolean;
      pivaMismatch?: boolean;
      /**
       * L'accesso AdE opera per conto di altri soggetti: queste sono le partite
       * IVA fra cui scegliere (HAR.md #18). Il portale AdE stesso le mostra
       * nude, senza denominazioni — noi mostriamo la ragione sociale dopo la
       * scelta, quando la verifica riuscita ce l'ha restituita.
       */
      utenzaChoices?: { piva: string }[];
    };

interface AdeCredentialsSectionProps {
  businessId: string | null;
  hasCredentials: boolean;
  verifiedAt: Date | null;
  loginMethod?: AdeLoginMethod;
}

const SUCCESS_DISMISS_MS = 3000;

export function AdeCredentialsSection({
  businessId,
  hasCredentials,
  verifiedAt,
  loginMethod = "fisconline",
}: Readonly<AdeCredentialsSectionProps>) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [verifyState, setVerifyState] = useState<VerifyState>({
    status: "idle",
  });
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

    setVerifyState({ status: "pending" });
    const id = businessId;

    startTransition(async () => {
      const result = await verifyAdeCredentials(id, utenzaPiva);

      if (result.error) {
        if (result.passwordExpired) {
          setVerifyState({ status: "idle" });
          setChangePasswordOpen(true);
          return;
        }
        setVerifyState({
          status: "error",
          message: result.error,
          pivaConflict: result.pivaConflict,
          pivaMismatch: result.pivaMismatch,
          utenzaChoices: result.utenzaChoices,
        });
        return;
      }

      setHasEverVerified(true);
      setVerifyState({ status: "success" });
      router.refresh();

      dismissTimerRef.current = setTimeout(() => {
        setVerifyState({ status: "idle" });
        dismissTimerRef.current = null;
      }, SUCCESS_DISMISS_MS);
    });
  }

  const isCie = loginMethod === "cie";

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
            {verifyState.utenzaChoices &&
              verifyState.utenzaChoices.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-sm font-medium">
                    Scegli la partita IVA su cui operare
                  </p>
                  <ul className="space-y-2">
                    {verifyState.utenzaChoices.map((choice) => (
                      <li
                        key={choice.piva}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="font-mono text-sm">{choice.piva}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerify(choice.piva)}
                        >
                          Collega
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground text-xs">
                    L&apos;Agenzia delle Entrate identifica le aziende solo con
                    la partita IVA, senza ragione sociale. Controllala bene:{" "}
                    <strong>non potrai più cambiarla</strong>. Per gestirne
                    un&apos;altra servirà un account separato.
                  </p>
                </div>
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
